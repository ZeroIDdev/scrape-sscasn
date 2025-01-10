from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route('/proxy', methods=['POST'])
def proxy():
    target_url = request.json.get("url")
    payload = request.json.get("payload")
    headers = request.json.get("headers", {})

    response = requests.get(target_url, json=payload, headers=headers)
    return jsonify(response.json())

if __name__ == '__main__':
    app.run(port=5000)
