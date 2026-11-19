package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/middleware"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/service"
)

type ProjectHandler struct{ svc *service.ProjectService }

func NewProjectHandler(svc *service.ProjectService) *ProjectHandler {
	return &ProjectHandler{svc: svc}
}

func (h *ProjectHandler) List(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	archived := c.Query("archived") == "true"
	items, err := h.svc.List(c.Request.Context(), middleware.CurrentUser(c).ID, q, archived)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, items)
}

func (h *ProjectHandler) Create(c *gin.Context) {
	var req dto.CreateProjectRequest
	if !bind(c, &req) {
		return
	}
	p, err := h.svc.Create(c.Request.Context(), middleware.CurrentUser(c).ID, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusCreated, p)
}

func (h *ProjectHandler) Get(c *gin.Context) {
	id, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	p, err := h.svc.Get(c.Request.Context(), middleware.CurrentUser(c).ID, id)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, p)
}

func (h *ProjectHandler) Update(c *gin.Context) {
	id, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	var req dto.UpdateProjectRequest
	if !bind(c, &req) {
		return
	}
	p, err := h.svc.Update(c.Request.Context(), middleware.CurrentUser(c).ID, id, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, p)
}

func (h *ProjectHandler) Archive(c *gin.Context) {
	id, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	var req dto.ArchiveProjectRequest
	if !bind(c, &req) {
		return
	}
	p, err := h.svc.SetArchived(c.Request.Context(), middleware.CurrentUser(c).ID, id, *req.Archived)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, p)
}

func (h *ProjectHandler) Delete(c *gin.Context) {
	id, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	var req dto.DeleteProjectRequest
	if !bind(c, &req) {
		return
	}
	if err := h.svc.Delete(c.Request.Context(), middleware.CurrentUser(c).ID, id, req); err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, nil)
}

func (h *ProjectHandler) ToggleFavorite(c *gin.Context) {
	id, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	fav, err := h.svc.ToggleFavorite(c.Request.Context(), middleware.CurrentUser(c).ID, id)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, dto.FavoriteResponse{IsFavorite: fav})
}
