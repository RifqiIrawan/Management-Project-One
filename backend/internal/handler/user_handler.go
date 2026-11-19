package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/middleware"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/service"
)

type UserHandler struct{ svc *service.UserService }

func NewUserHandler(svc *service.UserService) *UserHandler { return &UserHandler{svc: svc} }

func (h *UserHandler) Me(c *gin.Context) {
	response.OK(c, http.StatusOK, dto.NewUserResponse(middleware.CurrentUser(c)))
}

func (h *UserHandler) Search(c *gin.Context) {
	users, err := h.svc.Search(c.Request.Context(), middleware.CurrentUser(c).ID, c.Query("email"))
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, users)
}

func (h *UserHandler) UpdateMe(c *gin.Context) {
	var req dto.UpdateProfileRequest
	if !bind(c, &req) {
		return
	}
	u, err := h.svc.UpdateProfile(c.Request.Context(), middleware.CurrentUser(c).ID, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, dto.NewUserResponse(u))
}
