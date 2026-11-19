package service

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
)

var statusLabels = map[string]string{
	"todo": "To Do", "in_progress": "In Progress", "in_review": "In Review", "done": "Done",
}

var fieldLabels = map[string]string{
	"title": "judul", "description": "deskripsi", "priority": "prioritas",
	"labels": "label", "start_date": "tanggal mulai", "due_date": "deadline",
}

// parseMetadata membaca JSON metadata; JSON rusak menghasilkan map kosong (tidak pernah error).
func parseMetadata(raw string) map[string]any {
	m := map[string]any{}
	_ = json.Unmarshal([]byte(raw), &m)
	return m
}

func metaString(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// activityMessage menyusun kalimat riwayat berbahasa Indonesia, mis. "Budi membuat tugas MPO-12".
func activityMessage(a repository.ActivityRow, meta map[string]any) string {
	user := a.UserName
	code := metaString(meta, "code")
	if code == "" {
		code = "sebuah tugas"
	}
	switch a.Action {
	case "task.created":
		return fmt.Sprintf("%s membuat tugas %s", user, code)
	case "task.deleted":
		return fmt.Sprintf("%s menghapus tugas %s", user, code)
	case "task.status_changed":
		return fmt.Sprintf("%s memindahkan %s dari %s ke %s", user, code,
			label(statusLabels, metaString(meta, "from")), label(statusLabels, metaString(meta, "to")))
	case "task.assigned":
		if metaString(meta, "to") == "" {
			return fmt.Sprintf("%s melepas assignee dari %s", user, code)
		}
		to := "seseorang"
		if a.ToName != nil && *a.ToName != "" {
			to = *a.ToName
		}
		return fmt.Sprintf("%s meng-assign %s ke %s", user, code, to)
	case "task.updated":
		var parts []string
		if fields, ok := meta["fields"].([]any); ok {
			for _, f := range fields {
				if name, ok := f.(string); ok {
					parts = append(parts, label(fieldLabels, name))
				}
			}
		}
		if len(parts) == 0 {
			return fmt.Sprintf("%s mengubah %s", user, code)
		}
		return fmt.Sprintf("%s mengubah %s (%s)", user, code, strings.Join(parts, ", "))
	case "comment.created":
		return fmt.Sprintf("%s mengomentari %s", user, code)
	default:
		return fmt.Sprintf("%s melakukan %s pada %s", user, a.Action, code)
	}
}

func label(dict map[string]string, key string) string {
	if v, ok := dict[key]; ok {
		return v
	}
	return key
}
