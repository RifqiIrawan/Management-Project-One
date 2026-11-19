package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	StatusTodo       = "todo"
	StatusInProgress = "in_progress"
	StatusInReview   = "in_review"
	StatusDone       = "done"
)

// TaskStatuses berurutan seperti kolom Kanban.
var TaskStatuses = []string{StatusTodo, StatusInProgress, StatusInReview, StatusDone}

// StringArray memetakan kolom TEXT[] PostgreSQL.
//   - Value  : menulis sebagai literal array Postgres ({"a","b"}) agar aman untuk karakter khusus.
//   - Scan   : membaca JSON (query SELECT memakai to_json(kolom)::text).
type StringArray []string

var arrayEscaper = strings.NewReplacer(`\`, `\\`, `"`, `\"`)

func (a StringArray) Value() (driver.Value, error) {
	var b strings.Builder
	b.WriteByte('{')
	for i, s := range a {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteByte('"')
		b.WriteString(arrayEscaper.Replace(s))
		b.WriteByte('"')
	}
	b.WriteByte('}')
	return b.String(), nil
}

func (a *StringArray) Scan(src any) error {
	var raw []byte
	switch v := src.(type) {
	case nil:
		*a = StringArray{}
		return nil
	case string:
		raw = []byte(v)
	case []byte:
		raw = v
	default:
		return fmt.Errorf("StringArray: tipe sumber tidak didukung %T", src)
	}
	out := StringArray{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return fmt.Errorf("StringArray: %w", err)
	}
	*a = out
	return nil
}

type Task struct {
	ID          string `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProjectID   string `gorm:"type:uuid"`
	Number      int
	Title       string
	Description *string
	Status      string
	Priority    string
	Labels      StringArray
	Position    float64
	AssigneeID  *string `gorm:"type:uuid"`
	CreatedBy   string  `gorm:"type:uuid"`
	StartDate   *string
	DueDate     *string
	CompletedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
