from flask import Flask, request, jsonify, send_from_directory
# from flask_cors import CORS, cross_origin # comment out in deployment
import os, secrets, string
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate(os.getcwd() + "/key.json")
firebase_admin.initialize_app(cred)
db = firestore.client()


app = Flask(__name__, static_url_path='', static_folder='../client/build')
#CORS(app)
#cors = CORS() # comment out in deployment
#port = 9999

@app.route("/", defaults={'path':''})
def serve(path):
    return send_from_directory(app.static_folder,'index.html')

@app.route('/registrate', methods=['POST'])
#@cross_origin() # comment out in deployment
def registerToken(): 
    data = request.get_json()
    doc_ref = db.collection(u'users').document(u'' + data.get('id'))
    doc_ref.set(data)
    return jsonify(data)

@app.route('/authenticate', methods=['POST'])
#@cross_origin() # comment out in deployment
def authenticate():
    data = request.get_json()
    doc_ref = db.collection(u'users').document(u'' + data.get('id'))
    doc = doc_ref.get()
    if (doc.get('id') == data.get('id')):
        return jsonify(data)
    return None

@app.route('/generateToken', methods=['POST'])
#@cross_origin() # comment out in deployment
def generateToken(): 
    token = request.get_json()
    characters = string.ascii_letters + string.digits + '.,-*_'
    token = ''.join(secrets.choice(characters) for _ in range(16))
    doc_ref = db.collection("collectionName").document(token)
    doc = doc_ref.get()
    if doc.exists:
        generateToken()
    else:
        return jsonify(token)

#if __name__ == '__main__':
    #app.run(host='localhost', port=port, debug=True)
    