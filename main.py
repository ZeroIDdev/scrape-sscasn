import requests
import pandas as pd
import json
from pandas import json_normalize
import math
import os
import time
import random

def fetch_data_and_save(kode_ref_pend, total_data, program_name, offset, current_call=1, all_data=None):
    if all_data is None:
        all_data = []

    # Add a random delay between 2-4 seconds between API calls

    proxy_url = "http://127.0.0.1:5000/proxy"
    payload = {
        "url": f"https://api-sscasn.bkn.go.id/2024/portal/spf?kode_ref_pend={kode_ref_pend}&pengadaan_kd=3&offset={offset}",
        "payload": {"kode_ref_pend": kode_ref_pend, "pengadaan_kd": 3, "offset": offset},
        "headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            "Connection": "keep-alive",
            "Host": "api-sscasn.bkn.go.id",
            "Origin": "https://sscasn.bkn.go.id",
            "Referer": "https://sscasn.bkn.go.id/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
        }
    }

    try:
        response = requests.post(proxy_url, json=payload)
        if response.status_code == 200:
            data = response.json()
            if 'data' in data and 'data' in data['data']:
                # Add program_name to each item
                for item in data['data']['data']:
                    item['program_studi'] = program_name
                all_data.extend(data['data']['data'])
                print(f"Call {current_call}: Data fetched successfully for {program_name} (ID: {kode_ref_pend}), offset {offset}")

                # Calculate if we need more calls based on total_data
                if offset + 10 < total_data:
                    return fetch_data_and_save(kode_ref_pend, total_data, program_name, offset + 10, current_call + 1, all_data)
                else:
                    return all_data
            else:

                print(f"Call {current_call}: Unexpected data structure received from the API for {program_name} (ID: {kode_ref_pend}), offset {offset}")
                print(data)
                return all_data
        else:
            print(f"Call {current_call}: Failed to retrieve data for {program_name} (ID: {kode_ref_pend}), offset {offset}. Status code: {response.status_code}")
            return all_data
    except Exception as e:
        print(f"Error during API call: {e}")
        print(f"Waiting 30 seconds before continuing...")
        time.sleep(30)  # Wait longer if there's an error
        return all_data

def save_to_excel(data, filename="output_all_programs.xlsx"):
    df = json_normalize(data)
    df.to_excel(filename, index=False)
    print(f"Data saved to {filename} (Total records: {len(data)})")

def main():
    # Read the JSON file
    with open('collectedData.json', 'r') as file:
        program_data = json.load(file)

    # List to store all data
    all_data = []

    # Load existing data if file exists
    output_file = "output_all_programs.xlsx"
    if os.path.exists(output_file):
        try:
            existing_df = pd.read_excel(output_file)
            all_data = existing_df.to_dict('records')
            print(f"Loaded {len(all_data)} existing records from {output_file}")
        except Exception as e:
            print(f"Error loading existing file: {e}")
            all_data = []

    # Loop through each program
    for i, program in enumerate(program_data):
        kode_ref_pend = program['id']
        program_name = program['programStudi']
        jumlah_data = program['jumlahData']
        
        if jumlah_data > 0:
            print(f"\nProcessing {program_name} (ID: {kode_ref_pend}, Total Data: {jumlah_data})")
            print(f"Progress: {i+1}/{len(program_data)} programs")
            
            # Fetch data for this program starting with offset 10
            program_results = fetch_data_and_save(kode_ref_pend, jumlah_data, program_name, offset=10)
            
            if program_results:
                all_data.extend(program_results)
                print(f"Successfully fetched {len(program_results)} records for {program_name}")
                
                # Save after each program
                save_to_excel(all_data)
                
                # Add a longer delay between programs (5-8 seconds)
        else:
            print(f"\nSkipping {program_name} (ID: {kode_ref_pend}) - No data available")

if __name__ == "__main__":
    main()