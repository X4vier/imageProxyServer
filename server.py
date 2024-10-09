from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import json
from botocore.exceptions import ClientError

app = Flask(__name__)
CORS(app)  # This will enable CORS for all routes

# Initialize the Bedrock client
session = boto3.Session(
    profile_name='dev',  # Use the profile configured in ~/.aws/credentials
    region_name='us-east-1'  # Replace with your AWS region
)
bedrock_runtime = session.client('bedrock-runtime')

@app.route('/proxy/v1/messages', methods=['POST'])
def proxy_to_bedrock():
    try:
        # Get the request body
        request_data = request.json

        # Prepare the request body for Bedrock
        bedrock_request = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": request_data.get("max_tokens", 2048),
            "messages": request_data.get("messages", []),
            "temperature": request_data.get("temperature", 0.7)
        }

        # Specify the Claude 3.5 Sonnet model ID
        model_id = 'anthropic.claude-3-5-sonnet-20240620-v1:0'

        print(f"Invoking model: {model_id}")
        response = bedrock_runtime.invoke_model(
            modelId=model_id,
            body=json.dumps(bedrock_request)
        )

        # Parse the response
        response_body = json.loads(response['body'].read())

        return jsonify(response_body), 200

    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        return jsonify({"error": f"{error_code} - {error_message}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=3001)