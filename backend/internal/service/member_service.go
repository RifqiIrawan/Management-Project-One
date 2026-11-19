package service

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/dto"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

var errLastOwner = apperror.BadRequest(
	"Proyek harus punya minimal 1 owner. Jadikan anggota lain sebagai owner terlebih dahulu, atau hapus proyeknya.")

type MemberService struct {
	projectAccess
	members *repository.MemberRepository
	users   *repository.UserRepository
}

func NewMemberService(projects *repository.ProjectRepository, members *repository.MemberRepository, users *repository.UserRepository) *MemberService {
	return &MemberService{projectAccess: projectAccess{projects: projects}, members: members, users: users}
}

func (s *MemberService) List(ctx context.Context, actorID, projectID string) ([]dto.MemberResponse, error) {
	if _, err := s.member(ctx, actorID, projectID); err != nil {
		return nil, err
	}
	rows, err := s.members.List(ctx, projectID)
	if err != nil {
		return nil, err
	}
	out := make([]dto.MemberResponse, len(rows))
	for i := range rows {
		out[i] = toMemberResponse(&rows[i])
	}
	return out, nil
}

// Add mengundang user yang sudah terdaftar (berdasarkan email). Hanya owner.
func (s *MemberService) Add(ctx context.Context, actorID, projectID string, req dto.AddMemberRequest) (*dto.MemberResponse, error) {
	if _, err := s.owner(ctx, actorID, projectID); err != nil {
		return nil, err
	}
	user, err := s.users.FindByEmail(ctx, strings.ToLower(strings.TrimSpace(req.Email)))
	if err != nil {
		if errors.Is(err, apperror.ErrNotFound) {
			return nil, apperror.New(404, "NOT_FOUND", "User dengan email tersebut belum terdaftar")
		}
		return nil, err
	}
	role := req.Role
	if role == "" {
		role = model.RoleMember
	}
	if err := s.members.Add(ctx, &model.ProjectMember{ProjectID: projectID, UserID: user.ID, Role: role}); err != nil {
		return nil, err
	}
	row, err := s.members.GetRow(ctx, projectID, user.ID)
	if err != nil {
		return nil, err
	}
	resp := toMemberResponse(row)
	return &resp, nil
}

// UpdateRole mengubah role anggota. Hanya owner. Owner terakhir tidak bisa diturunkan.
func (s *MemberService) UpdateRole(ctx context.Context, actorID, projectID, targetID string, req dto.UpdateMemberRoleRequest) (*dto.MemberResponse, error) {
	if _, err := s.owner(ctx, actorID, projectID); err != nil {
		return nil, err
	}
	err := s.members.Transaction(ctx, func(tx *repository.MemberRepository) error {
		owners, err := tx.LockOwners(ctx, projectID)
		if err != nil {
			return err
		}
		target, err := tx.Find(ctx, projectID, targetID)
		if err != nil {
			return err
		}
		if target.Role == req.Role {
			return nil
		}
		if isLastOwner(owners, target, req.Role) {
			return errLastOwner
		}
		return tx.UpdateRole(ctx, projectID, targetID, req.Role)
	})
	if err != nil {
		return nil, err
	}
	row, err := s.members.GetRow(ctx, projectID, targetID)
	if err != nil {
		return nil, err
	}
	resp := toMemberResponse(row)
	return &resp, nil
}

// Remove mengeluarkan anggota (owner) atau keluar sendiri (siapa pun). Owner terakhir tidak bisa keluar.
func (s *MemberService) Remove(ctx context.Context, actorID, projectID, targetID string) error {
	actor, err := s.member(ctx, actorID, projectID)
	if err != nil {
		return err
	}
	if actorID != targetID && actor.MyRole != model.RoleOwner {
		return apperror.ErrForbidden
	}
	return s.members.Transaction(ctx, func(tx *repository.MemberRepository) error {
		owners, err := tx.LockOwners(ctx, projectID)
		if err != nil {
			return err
		}
		target, err := tx.Find(ctx, projectID, targetID)
		if err != nil {
			return err
		}
		if isLastOwner(owners, target, model.RoleMember) {
			return errLastOwner
		}
		// Tugas yang di-assign ke anggota ini menjadi unassigned (transaksi yang sama).
		if err := tx.UnassignTasks(ctx, projectID, targetID); err != nil {
			return err
		}
		return tx.Remove(ctx, projectID, targetID)
	})
}

// isLastOwner: true bila perubahan akan meninggalkan proyek tanpa owner.
func isLastOwner(owners []string, target *model.ProjectMember, newRole string) bool {
	return target.Role == model.RoleOwner && newRole != model.RoleOwner &&
		len(owners) <= 1 && slices.Contains(owners, target.UserID)
}

func toMemberResponse(r *repository.MemberRow) dto.MemberResponse {
	return dto.MemberResponse{
		UserID: r.UserID, Name: r.Name, Email: r.Email,
		AvatarColor: r.AvatarColor, Role: r.Role, JoinedAt: r.JoinedAt,
	}
}
