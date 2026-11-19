package validator

import (
	"strings"
	"testing"
)

func TestIsUUID(t *testing.T) {
	good := []string{"4f1c9a52-8d3e-4b6a-9c11-0a1b2c3d4e5f", "4F1C9A52-8D3E-4B6A-9C11-0A1B2C3D4E5F"}
	bad := []string{"", "abc", "1", "4f1c9a52-8d3e-4b6a-9c11-0a1b2c3d4e5", "4f1c9a52-8d3e-4b6a-9c11-0a1b2c3d4e5fx", "'; DROP TABLE users;--"}
	for _, s := range good {
		if !IsUUID(s) {
			t.Errorf("%q harus UUID valid", s)
		}
	}
	for _, s := range bad {
		if IsUUID(s) {
			t.Errorf("%q harus ditolak", s)
		}
	}
}

func TestCheckPassword(t *testing.T) {
	cases := []struct {
		pw string
		ok bool
	}{
		{"abc12345", true},
		{"Pass1234word", true},
		{"short1", false},
		{"onlyletters", false},
		{"12345678", false},
		{strings.Repeat("a1", 40), false}, // > 72 byte
	}
	for _, c := range cases {
		if got := CheckPassword(c.pw) == ""; got != c.ok {
			t.Errorf("CheckPassword(%q) ok=%v, harapan %v", c.pw, got, c.ok)
		}
	}
}
