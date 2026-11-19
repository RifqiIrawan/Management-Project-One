package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/middleware"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/service"
)

type CommentHandler struct{ svc *service.CommentService }

func NewCommentHandler(svc *service.CommentService) *CommentHandler { return &CommentHandler{svc: svc} }

func pageParams(c *gin.Context) dto.PageParams {
	return dto.PageParams{Page: c.Query("page"), PerPage: c.Query("per_page")}
}

func (h *CommentHandler) List(c *gin.Context) {
	taskID, ok := uuidParam(c, "taskId")
	if !ok {
		return
	}
	items, meta, err := h.svc.List(c.Request.Context(), middleware.CurrentUser(c).ID, taskID, pageParams(c))
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OKMeta(c, http.StatusOK, items, meta)
}

func (h *CommentHandler) Create(c *gin.Context) {
	taskID, ok := uuidParam(c, "taskId")
	if !ok {
		return
	}
	var req dto.CreateCommentRequest
	if !bind(c, &req) {
		return
	}
	cm, err := h.svc.Create(c.Request.Context(), middleware.CurrentUser(c).ID, taskID, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusCreated, cm)
}

func (h *CommentHandler) Update(c *gin.Context) {
	id, ok := uuidParam(c, "commentId")
	if !ok {
		return
	}
	var req dto.UpdateCommentRequest
	if !bind(c, &req) {
		return
	}
	cm, err := h.svc.Update(c.Request.Context(), middleware.CurrentUser(c).ID, id, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, cm)
}

func (h *CommentHandler) Delete(c *gin.Context) {
	id, ok := uuidParam(c, "commentId")
	if !ok {
		return
	}
	if err := h.svc.Delete(c.Request.Context(), middleware.CurrentUser(c).ID, id); err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, nil)
}
