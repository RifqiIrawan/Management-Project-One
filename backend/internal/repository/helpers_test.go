package repository

import "testing"

func TestEscapeLike(t *testing.T) {
	cases := map[string]string{
		"biasa":   "biasa",
		"100%":    `100\%`,
		"a_b":     `a\_b`,
		`back\sl`: `back\\sl`,
		"%_%":     `\%\_\%`,
	}
	for in, want := range cases {
		if got := escapeLike(in); got != want {
			t.Errorf("escapeLike(%q) = %q, harapan %q", in, got, want)
		}
	}
}
