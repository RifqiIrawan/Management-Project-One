package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/service"
)

const userKey = "current_user"

// Auth memverifikasi header "Authorization: Bearer <access_token>".
func Auth(svc *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		parts := strings.SplitN(c.GetHeader("Authorization"), " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			response.Err(c, apperror.ErrUnauthorized)
			return
		}
		u, err := svc.Authenticate(c.Request.Context(), parts[1])
		if err != nil {
			response.Err(c, err)
			return
		}
		c.Set(userKey, u)
		c.Next()
	}
}

// CurrentUser mengambil user hasil autentikasi (hanya valid setelah middleware Auth).
func CurrentUser(c *gin.Context) *model.User {
	return c.MustGet(userKey).(*model.User)
}
