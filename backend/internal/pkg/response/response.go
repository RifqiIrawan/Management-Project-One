package response

import "github.com/gin-gonic/gin"

type Body struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Data    any    `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}

func OK(c *gin.Context, status int, data any) {
	c.JSON(status, Body{Success: true, Data: data})
}

func Fail(c *gin.Context, status int, msg string) {
	c.JSON(status, Body{Success: false, Error: msg})
}
