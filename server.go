package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
)

type ProxyRequest struct {
	URL     string            `json:"url"`
	Payload interface{}       `json:"payload"`
	Headers map[string]string `json:"headers"`
}

func main() {
	client := &http.Client{}

	http.HandleFunc("/proxy", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req ProxyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Create request
		proxyReq, err := http.NewRequest(http.MethodGet, req.URL, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Add headers
		for k, v := range req.Headers {
			proxyReq.Header.Set(k, v)
		}

		// Make request in a goroutine
		respChan := make(chan []byte)
		errChan := make(chan error)

		go func() {
			resp, err := client.Do(proxyReq)
			if err != nil {
				errChan <- err
				return
			}
			defer resp.Body.Close()

			body, err := io.ReadAll(resp.Body)
			if err != nil {
				errChan <- err
				return
			}
			respChan <- body
		}()

		// Wait for response or error
		select {
		case body := <-respChan:
			w.Header().Set("Content-Type", "application/json")
			w.Write(body)
		case err := <-errChan:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	log.Println("Server starting on :5000")
	log.Fatal(http.ListenAndServe(":5000", nil))
}
