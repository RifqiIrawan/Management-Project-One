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
	out, meta, err := h.svc.List(c.Request.Context(), middleware.CurrentUser(c).ID, projectID, listParams(c))
	if err != nil {
		response.Err(c, err)
		return
	}
	respondList(c, out, meta)
}

// MyTasks: GET /me/tasks, tugas yang di-assign ke saya lintas proyek.
func (h *TaskHandler) MyTasks(c *gin.Context) {
	out, meta, err := h.svc.MyTasks(c.Request.Context(), middleware.CurrentUser(c).ID, listParams(c))
	if err != nil {
		response.Err(c, err)
		return
	}
	respondList(c, out, meta)
}

func listParams(c *gin.Context) dto.TaskListParams {
	return dto.TaskListParams{
		Q: c.Query("q"), Status: c.Query("status"), Priority: c.Query("priority"),
		Assignee: c.Query("assignee"), Due: c.Query("due"), Sort: c.Query("sort"),
		Page: c.Query("page"), PerPage: c.Query("per_page"),
		View: c.Query("view"), Group: c.Query("group"), IncludeDone: c.Query("include_done"),
	}
}

func respondList(c *gin.Context, data any, meta *dto.PageMeta) {
	if meta == nil {
		response.OK(c, http.StatusOK, data)
		return
	}
	response.OKMeta(c, http.StatusOK, data, meta)
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
