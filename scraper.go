package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/xuri/excelize/v2"
)

type Program struct {
	ID           string `json:"id"`
	ProgramStudi string `json:"programStudi"`
	JumlahData   int    `json:"jumlahData"`
}

type ProxyRequest struct {
	URL     string            `json:"url"`
	Payload interface{}       `json:"payload"`
	Headers map[string]string `json:"headers"`
}

type APIResponse struct {
	Data struct {
		Data []map[string]interface{} `json:"data"`
	} `json:"data"`
}

func fetchData(program Program, offset int, wg *sync.WaitGroup, resultChan chan<- []map[string]interface{}) {
	defer wg.Done()

	headers := map[string]string{
		"User-Agent":         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		"Accept":             "application/json, text/plain, */*",
		"Accept-Encoding":    "gzip, deflate, br, zstd",
		"Accept-Language":    "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
		"Connection":         "keep-alive",
		"Host":               "api-sscasn.bkn.go.id",
		"Origin":             "https://sscasn.bkn.go.id",
		"Referer":            "https://sscasn.bkn.go.id/",
		"Sec-Fetch-Dest":     "empty",
		"Sec-Fetch-Mode":     "cors",
		"Sec-Fetch-Site":     "same-site",
		"sec-ch-ua":          "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
		"sec-ch-ua-mobile":   "?0",
		"sec-ch-ua-platform": "\"Windows\"",
	}

	payload := ProxyRequest{
		URL: fmt.Sprintf("https://api-sscasn.bkn.go.id/2024/portal/spf?kode_ref_pend=%s&pengadaan_kd=3&offset=%d",
			program.ID, offset),
		Payload: map[string]interface{}{
			"kode_ref_pend": program.ID,
			"pengadaan_kd":  3,
			"offset":        offset,
		},
		Headers: headers,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshaling payload: %v", err)
		return
	}

	resp, err := http.Post("http://127.0.0.1:5000/proxy", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Error making request: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("Error status code: %d", resp.StatusCode)
		return
	}

	var apiResp APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		log.Printf("Error decoding response: %v", err)
		return
	}

	// Add program name to each item
	for i := range apiResp.Data.Data {
		apiResp.Data.Data[i]["program_studi"] = program.ProgramStudi
	}

	resultChan <- apiResp.Data.Data
}

func saveToExcel(data []map[string]interface{}, filename string) error {
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			log.Printf("Error closing Excel file: %v", err)
		}
	}()

	// Get all unique columns
	columns := make(map[string]bool)
	for _, record := range data {
		for key := range record {
			columns[key] = true
		}
	}

	// Convert columns to slice and write header
	var headerColumns []string
	for col := range columns {
		headerColumns = append(headerColumns, col)
	}

	for i, col := range headerColumns {
		cell, err := excelize.CoordinatesToCellName(i+1, 1)
		if err != nil {
			return fmt.Errorf("error converting coordinates to cell name: %v", err)
		}
		if err := f.SetCellValue("Sheet1", cell, col); err != nil {
			return fmt.Errorf("error setting cell value: %v", err)
		}
	}

	// Write data
	for rowIdx, record := range data {
		for colIdx, col := range headerColumns {
			cell, err := excelize.CoordinatesToCellName(colIdx+1, rowIdx+2)
			if err != nil {
				return fmt.Errorf("error converting coordinates to cell name: %v", err)
			}
			if err := f.SetCellValue("Sheet1", cell, record[col]); err != nil {
				return fmt.Errorf("error setting cell value: %v", err)
			}
		}
	}

	return f.SaveAs(filename)
}

func main() {
	// Read program data
	data, err := os.ReadFile("collectedData.json")
	if err != nil {
		log.Fatalf("Error reading program data: %v", err)
	}

	var programs []Program
	if err := json.Unmarshal(data, &programs); err != nil {
		log.Fatalf("Error parsing program data: %v", err)
	}

	var wg sync.WaitGroup
	resultChan := make(chan []map[string]interface{}, 1000)

	// Start fetching data for each program
	for _, program := range programs {
		if program.JumlahData == 0 {
			log.Printf("Skipping %s (ID: %s) - No data available", program.ProgramStudi, program.ID)
			continue
		}

		log.Printf("Processing %s (ID: %s, Total Data: %d)", program.ProgramStudi, program.ID, program.JumlahData)

		// Start fetching data with offsets
		for offset := 0; offset < program.JumlahData; offset += 10 {
			wg.Add(1)
			go fetchData(program, offset, &wg, resultChan)
		}
	}

	// Start a goroutine to close resultChan when all fetches are done
	go func() {
		wg.Wait()
		close(resultChan)
	}()

	// Collect all results
	var allData []map[string]interface{}
	for result := range resultChan {
		allData = append(allData, result...)
		log.Printf("Current total records: %d", len(allData))
	}

	// Save results
	if err := saveToExcel(allData, "output_all_programs.xlsx"); err != nil {
		log.Fatalf("Error saving to Excel: %v", err)
	}

	log.Printf("Completed! Total records saved: %d", len(allData))
}
