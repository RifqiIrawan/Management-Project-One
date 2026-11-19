package service

import (
	"testing"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/model"
)

func TestIsLastOwner(t *testing.T) {
	owner := &model.ProjectMember{UserID: "a", Role: model.RoleOwner}
	member := &model.ProjectMember{UserID: "b", Role: model.RoleMember}

	cases := []struct {
		name    string
		owners  []string
		target  *model.ProjectMember
		newRole string
		want    bool
	}{
		{"owner tunggal diturunkan", []string{"a"}, owner, model.RoleMember, true},
		{"owner tunggal keluar (role member = dihapus)", []string{"a"}, owner, model.RoleMember, true},
		{"ada owner lain", []string{"a", "c"}, owner, model.RoleMember, false},
		{"tetap owner", []string{"a"}, owner, model.RoleOwner, false},
		{"member biasa dikeluarkan", []string{"a"}, member, model.RoleMember, false},
		{"member dijadikan owner", []string{"a"}, member, model.RoleOwner, false},
	}
	for _, c := range cases {
		if got := isLastOwner(c.owners, c.target, c.newRole); got != c.want {
			t.Errorf("%s: dapat %v, harapan %v", c.name, got, c.want)
		}
	}
}
