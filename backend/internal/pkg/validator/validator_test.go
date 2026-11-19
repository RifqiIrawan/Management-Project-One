package validator

import (
	"strings"
	"testing"
)

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
