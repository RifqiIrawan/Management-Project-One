package hash

import "golang.org/x/crypto/bcrypt"

func Password(plain string, cost int) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), cost)
	return string(b), err
}

func Compare(hashed, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(plain)) == nil
}
