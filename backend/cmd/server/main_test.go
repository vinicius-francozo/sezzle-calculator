package main

import "testing"

func TestListenAddress(t *testing.T) {
	tests := []struct {
		name string
		port string
		want string
	}{
		{name: "default port", port: "", want: ":8080"},
		{name: "port from the environment", port: "9000", want: ":9000"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("PORT", test.port)

			if got := listenAddress(); got != test.want {
				t.Errorf("listenAddress() = %q, want %q", got, test.want)
			}
		})
	}
}
