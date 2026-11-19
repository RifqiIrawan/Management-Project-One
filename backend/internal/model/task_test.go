package model

import "testing"

func TestStringArrayValue(t *testing.T) {
	cases := map[string]StringArray{
		`{}`:                nil,
		`{"a","b"}`:         {"a", "b"},
		`{"a,b","c d"}`:     {"a,b", "c d"},
		`{"say \"hi\""}`:    {`say "hi"`},
		`{"back\\slash"}`:   {`back\slash`},
		`{"{x}","NULL"}`:    {"{x}", "NULL"},
		`{"emoji 🚀","日本語"}`: {"emoji 🚀", "日本語"},
	}
	for want, in := range cases {
		got, err := in.Value()
		if err != nil || got != want {
			t.Errorf("Value(%q) = %v (%v), harapan %s", []string(in), got, err, want)
		}
	}
}

func TestStringArrayScan(t *testing.T) {
	var a StringArray
	if err := a.Scan(`["x","y z"]`); err != nil || len(a) != 2 || a[1] != "y z" {
		t.Fatalf("scan string: %v %v", a, err)
	}
	if err := a.Scan([]byte(`[]`)); err != nil || a == nil || len(a) != 0 {
		t.Fatalf("scan [] harus slice kosong non-nil: %#v %v", a, err)
	}
	if err := a.Scan(nil); err != nil || a == nil || len(a) != 0 {
		t.Fatalf("scan nil harus slice kosong: %#v %v", a, err)
	}
	if err := a.Scan(42); err == nil {
		t.Fatal("tipe tak didukung harus error")
	}
}
