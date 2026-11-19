package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/validator"
)

// uuidParam membaca parameter path berformat UUID. ID yang formatnya salah dijawab 404,
// sama seperti ID yang tidak ada.
func uuidParam(c *gin.Context, name string) (string, bool) {
	v := c.Param(name)
	if !validator.IsUUID(v) {
		response.Err(c, apperror.ErrNotFound)
		return "", false
	}
	return v, true
}
