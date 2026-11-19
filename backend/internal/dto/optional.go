package dto

import "encoding/json"

// Optional membedakan tiga keadaan field JSON pada PATCH:
//
//	tidak dikirim  -> Set=false           (jangan diubah)
//	dikirim null   -> Set=true, Null=true (kosongkan)
//	dikirim nilai  -> Set=true, Value=... (ubah)
type Optional[T any] struct {
	Set   bool
	Null  bool
	Value T
}

func (o *Optional[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Null = true
		return nil
	}
	return json.Unmarshal(b, &o.Value)
}
