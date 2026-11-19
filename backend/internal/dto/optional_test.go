package dto

import (
	"encoding/json"
	"testing"
)

func TestOptionalThreeStates(t *testing.T) {
	var r UpdateTaskRequest

	if err := json.Unmarshal([]byte(`{}`), &r); err != nil {
		t.Fatal(err)
	}
	if r.Description.Set || r.AssigneeID.Set {
		t.Fatal("field yang tidak dikirim tidak boleh Set")
	}

	r = UpdateTaskRequest{}
	if err := json.Unmarshal([]byte(`{"description":null,"assignee_id":null,"due_date":"2026-12-01"}`), &r); err != nil {
		t.Fatal(err)
	}
	if !r.Description.Set || !r.Description.Null || !r.AssigneeID.Set || !r.AssigneeID.Null {
		t.Fatal("null harus Set=true, Null=true")
	}
	if !r.DueDate.Set || r.DueDate.Null || r.DueDate.Value != "2026-12-01" {
		t.Fatalf("nilai biasa salah: %+v", r.DueDate)
	}

	r = UpdateTaskRequest{}
	if err := json.Unmarshal([]byte(`{"description":123}`), &r); err == nil {
		t.Fatal("tipe salah harus error")
	}
}
