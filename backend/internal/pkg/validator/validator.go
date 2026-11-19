package validator

import (
	"errors"
	"fmt"
	"reflect"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
)

var labels = map[string]string{
	"name":             "Nama",
	"email":            "Email",
	"password":         "Password",
	"confirm_password": "Konfirmasi password",
	"current_password": "Password lama",
	"new_password":     "Password baru",
	"avatar_color":     "Warna avatar",
}

// Init membuat nama field di error mengikuti tag json (bukan nama struct).
func Init() {
	if v, ok := binding.Validator.Engine().(*validator.Validate); ok {
		v.RegisterTagNameFunc(func(f reflect.StructField) string {
			n := strings.SplitN(f.Tag.Get("json"), ",", 2)[0]
			if n == "-" {
				return ""
			}
			return n
		})
	}
}

// Translate mengubah error binding menjadi apperror dengan pesan Indonesia.
func Translate(err error) *apperror.Error {
	var ve validator.ValidationErrors
	if errors.As(err, &ve) {
		d := make(map[string]string, len(ve))
		for _, fe := range ve {
			d[fe.Field()] = label(fe.Field()) + " " + message(fe)
		}
		return apperror.Validation(d)
	}
	return apperror.BadRequest("Format data yang dikirim tidak valid")
}

func label(field string) string {
	if l, ok := labels[field]; ok {
		return l
	}
	return field
}

func message(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "wajib diisi"
	case "email":
		return "tidak valid"
	case "min":
		return fmt.Sprintf("minimal %s karakter", fe.Param())
	case "max":
		return fmt.Sprintf("maksimal %s karakter", fe.Param())
	case "eqfield":
		return "tidak sama"
	case "hexcolor":
		return "harus berupa kode hex, mis. #6366F1"
	default:
		return "tidak valid"
	}
}

// CheckPassword mengembalikan pesan error, atau "" jika password memenuhi aturan:
// min 8 karakter, mengandung huruf dan angka, maks 72 byte (batas bcrypt).
func CheckPassword(pw string) string {
	if len([]rune(pw)) < 8 {
		return "Password minimal 8 karakter"
	}
	if len(pw) > 72 {
		return "Password terlalu panjang (maks 72 byte)"
	}
	var letter, digit bool
	for _, r := range pw {
		switch {
		case unicode.IsLetter(r):
			letter = true
		case unicode.IsDigit(r):
			digit = true
		}
	}
	if !letter || !digit {
		return "Password harus mengandung huruf dan angka"
	}
	return ""
}
