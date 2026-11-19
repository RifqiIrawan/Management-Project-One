package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/middleware"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/service"
)

type ActivityHandler struct{ svc *service.ActivityService }

func NewActivityHandler(svc *service.ActivityService) *ActivityHandler {
	return &ActivityHandler{svc: svc}
}

func (h *ActivityHandler) ListProject(c *gin.Context) {
	projectID, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	items, meta, err := h.svc.ListProject(c.Request.Context(), middleware.CurrentUser(c).ID, projectID, pageParams(c))
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OKMeta(c, http.StatusOK, items, meta)
}

func (h *ActivityHandler) ListTask(c *gin.Context) {
	taskID, ok := uuidParam(c, "taskId")
	if !ok {
		return
	}
	items, meta, err := h.svc.ListTask(c.Request.Context(), middleware.CurrentUser(c).ID, taskID, pageParams(c))
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OKMeta(c, http.StatusOK, items, meta)
}
