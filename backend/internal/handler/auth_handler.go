package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/config"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/middleware"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/validator"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/service"
)

const (
	refreshCookie = "refresh_token"
	cookiePath    = "/api/v1/auth"
)

type AuthHandler struct {
	svc *service.AuthService
	cfg *config.Config
}

func NewAuthHandler(svc *service.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{svc: svc, cfg: cfg}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if !bind(c, &req) {
		return
	}
	u, err := h.svc.Register(c.Request.Context(), req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusCreated, dto.NewUserResponse(u))
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if !bind(c, &req) {
		return
	}
	s, err := h.svc.Login(c.Request.Context(), req, clientMeta(c))
	if err != nil {
		response.Err(c, err)
		return
	}
	h.sendSession(c, s)
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	raw, err := c.Cookie(refreshCookie)
	if err != nil || raw == "" {
		response.Err(c, apperror.Unauthorized("Refresh token tidak ditemukan"))
		return
	}
	s, err := h.svc.Refresh(c.Request.Context(), raw, clientMeta(c))
	if err != nil {
		h.clearCookie(c)
		response.Err(c, err)
		return
	}
	h.sendSession(c, s)
}

func (h *AuthHandler) Logout(c *gin.Context) {
	raw, _ := c.Cookie(refreshCookie)
	if err := h.svc.Logout(c.Request.Context(), raw); err != nil {
		response.Err(c, err)
		return
	}
	h.clearCookie(c)
	response.OK(c, http.StatusOK, nil)
}

func (h *AuthHandler) LogoutAll(c *gin.Context) {
	if err := h.svc.LogoutAll(c.Request.Context(), middleware.CurrentUser(c).ID); err != nil {
		response.Err(c, err)
		return
	}
	h.clearCookie(c)
	response.OK(c, http.StatusOK, nil)
}

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req dto.ChangePasswordRequest
	if !bind(c, &req) {
		return
	}
	s, err := h.svc.ChangePassword(c.Request.Context(), middleware.CurrentUser(c).ID, req, clientMeta(c))
	if err != nil {
		response.Err(c, err)
		return
	}
	h.sendSession(c, s)
}

func (h *AuthHandler) sendSession(c *gin.Context, s *service.Session) {
	maxAge := int(time.Until(s.RefreshExpires).Seconds())
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(refreshCookie, s.RefreshToken, maxAge, cookiePath, "", h.cfg.CookieSecure, true)
	response.OK(c, http.StatusOK, dto.AuthResponse{
		AccessToken: s.AccessToken,
		TokenType:   "Bearer",
		ExpiresIn:   s.ExpiresIn,
		User:        dto.NewUserResponse(s.User),
	})
}

func (h *AuthHandler) clearCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(refreshCookie, "", -1, cookiePath, "", h.cfg.CookieSecure, true)
}

func clientMeta(c *gin.Context) service.ClientMeta {
	return service.ClientMeta{UserAgent: c.Request.UserAgent(), IP: c.ClientIP()}
}

// bind membaca JSON body dan mengirim 400 bila tidak valid.
func bind(c *gin.Context, req any) bool {
	if err := c.ShouldBindJSON(req); err != nil {
		response.Err(c, validator.Translate(err))
		return false
	}
	return true
}
