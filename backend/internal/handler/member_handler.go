package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/middleware"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/service"
)

type MemberHandler struct{ svc *service.MemberService }

func NewMemberHandler(svc *service.MemberService) *MemberHandler { return &MemberHandler{svc: svc} }

func (h *MemberHandler) List(c *gin.Context) {
	projectID, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	items, err := h.svc.List(c.Request.Context(), middleware.CurrentUser(c).ID, projectID)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, items)
}

func (h *MemberHandler) Add(c *gin.Context) {
	projectID, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	var req dto.AddMemberRequest
	if !bind(c, &req) {
		return
	}
	m, err := h.svc.Add(c.Request.Context(), middleware.CurrentUser(c).ID, projectID, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusCreated, m)
}

func (h *MemberHandler) UpdateRole(c *gin.Context) {
	projectID, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	userID, ok := uuidParam(c, "userId")
	if !ok {
		return
	}
	var req dto.UpdateMemberRoleRequest
	if !bind(c, &req) {
		return
	}
	m, err := h.svc.UpdateRole(c.Request.Context(), middleware.CurrentUser(c).ID, projectID, userID, req)
	if err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, m)
}

func (h *MemberHandler) Remove(c *gin.Context) {
	projectID, ok := uuidParam(c, "projectId")
	if !ok {
		return
	}
	userID, ok := uuidParam(c, "userId")
	if !ok {
		return
	}
	if err := h.svc.Remove(c.Request.Context(), middleware.CurrentUser(c).ID, projectID, userID); err != nil {
		response.Err(c, err)
		return
	}
	response.OK(c, http.StatusOK, nil)
}
