package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/middleware"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/service"
)

type TaskHandler struct{ svc *service.TaskService }

func NewTaskHandler(svc *service.TaskService) *TaskHandler { return &TaskHandler{svc: svc} }

func (h *TaskHandler) List(c *gin.Context) {
	projectID, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	out, err := h.svc.List(c.Request.Context(), middleware.CurrentUser(c).ID, projectID, c.Query("view") == "board")
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, out)
}

func (h *TaskHandler) Create(c *gin.Context) {
	projectID, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	var req dto.CreateTaskRequest
	if !bind(c, &req) {
		return
	}
	t, err := h.svc.Create(c.Request.Context(), middleware.CurrentUser(c).ID, projectID, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusCreated, t)
}

func (h *TaskHandler) Get(c *gin.Context) {
	id, ok := uuidParam(c, "taskId")
	if !ok {
		return
	}
	t, err := h.svc.Get(c.Request.Context(), middleware.CurrentUser(c).ID, id)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, t)
}

func (h *TaskHandler) Update(c *gin.Context) {
	id, ok := uuidParam(c, "taskId")
	if !ok {
		return
	}
	var req dto.UpdateTaskRequest
	if !bind(c, &req) {
		return
	}
	t, err := h.svc.Update(c.Request.Context(), middleware.CurrentUser(c).ID, id, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, t)
}

func (h *TaskHandler) Move(c *gin.Context) {
	id, ok := uuidParam(c, "taskId")
	if !ok {
		return
	}
	var req dto.MoveTaskRequest
	if !bind(c, &req) {
		return
	}
	t, err := h.svc.Move(c.Request.Context(), middleware.CurrentUser(c).ID, id, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, t)
}

func (h *TaskHandler) Delete(c *gin.Context) {
	id, ok := uuidParam(c, "taskId")
	if !ok {
		return
	}
	if err := h.svc.Delete(c.Request.Context(), middleware.CurrentUser(c).ID, id); err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, nil)
}
