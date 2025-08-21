#!/usr/bin/env python3
"""
Fetch actual face data with bounding boxes from Firebase
to understand the structure for implementing face cropping
"""

import firebase_admin
from firebase_admin import credentials, firestore
import json

# Initialize Firebase if not already done
if not firebase_admin._apps:
    cred = credentials.Certificate('/home/tim/credentials/firebase-credentials.json')
    firebase_admin.initialize_app(cred)

def fetch_face_data_for_ui():
    """Fetch face data with bounding boxes for UI implementation"""
    
    user_id = "zsvLTeIPJUYGnZHzWX7hVtLJlJX2"
    db = firestore.client()
    
    print(f"\n🔍 Fetching face data for user: {user_id}")
    print("="*60)
    
    # Real file IDs from the test
    file_ids = [
        'file_1755659985239_7le2TjzJGZ',
        'file_1755659986536_HA8cvhthi5',
        'file_1755659987594_8VOMGbAoEd',
        'file_1755659988640_Pa68yHCb0p',
        'file_1755659989503_eavQhJ2RmP'
    ]
    
    face_data_map = {}
    
    for file_id in file_ids:
        print(f"\n📄 Checking file: {file_id}")
        
        # Try multiple locations where files might be stored
        locations_to_check = [
            ('files collection', db.collection('files').document(file_id)),
            ('user subcollection', db.collection('users').document(user_id).collection('files').document(file_id))
        ]
        
        doc_found = False
        for location_name, doc_ref in locations_to_check:
            doc = doc_ref.get()
            
            if doc.exists:
                doc_found = True
                print(f"   Found in {location_name}")
                doc_data = doc.to_dict()
                
                # Check for extractedFaces
                if 'extractedFaces' in doc_data:
                    faces = doc_data['extractedFaces']
                    if faces and len(faces) > 0:
                        print(f"   Found {len(faces)} faces in file")
                        
                        for i, face in enumerate(faces):
                            face_id = face.get('FaceId', face.get('faceId'))
                            
                            # Extract bounding box data
                            bounding_box = face.get('BoundingBox', face.get('boundingBox', {}))
                            
                            if face_id and bounding_box:
                                face_info = {
                                    'fileId': file_id,
                                    'faceId': face_id,
                                    'boundingBox': bounding_box,
                                    'confidence': face.get('Confidence', face.get('confidence', 0))
                                }
                                
                                face_data_map[face_id] = face_info
                                
                                print(f"\n   Face {i+1}:")
                                print(f"     FaceId: {face_id[:20]}...")
                                print(f"     BoundingBox: {json.dumps(bounding_box, indent=8)}")
                                print(f"     Confidence: {face_info['confidence']}%")
                else:
                    print(f"   No extractedFaces field in document")
                break  # Found the document, no need to check other locations
        
        if not doc_found:
            print(f"   Document not found in any location")
    
    # Save the face data for JavaScript implementation
    output = {
        'userId': user_id,
        'faces': face_data_map,
        'files': file_ids
    }
    
    output_file = '/home/tim/current-projects/FaceManagerService/face_data_sample.json'
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✅ Face data saved to: {output_file}")
    print(f"   Total faces with bounding boxes: {len(face_data_map)}")
    
    return face_data_map

if __name__ == "__main__":
    fetch_face_data_for_ui()