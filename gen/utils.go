package gen

import (
	"math/rand"
	"time"
)

// Helper functions for random generation
func RandomString(r *rand.Rand, length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[r.Intn(len(charset))]
	}
	return string(b)
}

func RandomBytes(r *rand.Rand, length int) []byte {
	b := make([]byte, length)
	r.Read(b)
	return b
}

func RandomTime(r *rand.Rand) time.Time {
	return time.Now().Add(time.Duration(r.Int63n(1000000)) * time.Second)
}

func RandomTimePtr(r *rand.Rand) *time.Time {
	t := RandomTime(r)
	return &t
}

// Helper function for byte slice comparison
func BytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
