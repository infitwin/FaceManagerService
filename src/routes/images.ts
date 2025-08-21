/**
 * Image routes for fetching actual image URLs from Firestore
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../config/firebase';

const router = Router();

/**
 * Get image URL for a file from Firestore
 */
router.get('/image/:userId/:fileId', async (req: Request, res: Response) => {
  try {
    const { userId, fileId } = req.params;
    
    console.log(`Fetching image for user: ${userId}, file: ${fileId}`);
    
    const db = getDb();
    
    // Try to get the file from user's subcollection first
    const userFileDoc = await db
      .collection('users')
      .doc(userId)
      .collection('files')
      .doc(fileId)
      .get();
    
    if (userFileDoc.exists) {
      const data = userFileDoc.data();
      
      // Check for various possible URL fields
      const imageUrl = data?.url || 
                      data?.imageUrl || 
                      data?.fileUrl || 
                      data?.downloadURL ||
                      data?.storageUrl;
      
      if (imageUrl) {
        console.log(`Found image URL: ${imageUrl}`);
        // Set CORS headers to allow image loading
        res.set('Access-Control-Allow-Origin', '*');
        // Redirect to the actual image
        return res.redirect(imageUrl);
      }
      
      // If no direct URL, check if there's a storage path
      const storagePath = data?.storagePath || data?.path;
      if (storagePath) {
        // Construct Firebase Storage URL
        const storageUrl = `https://firebasestorage.googleapis.com/v0/b/infitwin.appspot.com/o/${encodeURIComponent(storagePath)}?alt=media`;
        console.log(`Constructed storage URL from path: ${storageUrl}`);
        return res.redirect(storageUrl);
      }
    }
    
    // Try the main files collection
    const mainFileDoc = await db
      .collection('files')
      .doc(fileId)
      .get();
    
    if (mainFileDoc.exists) {
      const data = mainFileDoc.data();
      
      const imageUrl = data?.url || 
                      data?.imageUrl || 
                      data?.fileUrl || 
                      data?.downloadURL ||
                      data?.storageUrl;
      
      if (imageUrl) {
        console.log(`Found image URL in main collection: ${imageUrl}`);
        return res.redirect(imageUrl);
      }
    }
    
    // If we still don't have an image, return a placeholder
    console.log(`No image found for ${fileId}, returning placeholder`);
    res.status(404).json({ 
      error: 'Image not found',
      fileId,
      userId 
    });
    
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

/**
 * Get all file data with faces for a user
 */
router.get('/files-with-faces/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const db = getDb();
    
    const filesData: any[] = [];
    
    // Get files from user subcollection
    const userFiles = await db
      .collection('users')
      .doc(userId)
      .collection('files')
      .get();
    
    for (const doc of userFiles.docs) {
      const data = doc.data();
      if (data.extractedFaces && data.extractedFaces.length > 0) {
        filesData.push({
          fileId: doc.id,
          url: data.url || data.imageUrl || data.fileUrl || data.downloadURL,
          storagePath: data.storagePath || data.path,
          fileName: data.fileName,
          faces: data.extractedFaces
        });
      }
    }
    
    res.json({
      success: true,
      files: filesData
    });
    
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

export default router;