import { Router } from 'express';
import multer from 'multer';
import { FileService } from '../services/fileService';
import { broadcast } from '../index';
import csv from 'csv-parser';
import fs from 'fs';

const router = Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/' });

// Get all requirements in a file
router.get('/:fileType', (req, res) => {
    try {
        const { projectId, fileType } = req.params as any;
        const requirements = FileService.getRequirements(projectId, fileType);
        res.json(requirements);
    } catch (err: any) {
        res.status(404).json({ error: err.message });
    }
});

// Upload CSV or JSON to replace a file
router.post('/:fileType', upload.single('file'), (req, res) => {
    try {
        const { projectId, fileType } = req.params as any;
        const file = req.file;
        
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(file.path, 'utf8'));
            FileService.replaceFile(projectId, fileType, data);
            broadcast({ type: 'FILE_REPLACED', projectId, fileType, data });
            fs.unlinkSync(file.path);
            res.json({ message: 'File replaced successfully' });
        } else if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            const results: any[] = [];
            fs.createReadStream(file.path)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => {
                    FileService.replaceFile(projectId, fileType, results);
                    broadcast({ type: 'FILE_REPLACED', projectId, fileType, data: results });
                    fs.unlinkSync(file.path);
                    res.json({ message: 'File replaced successfully' });
                });
        } else {
            fs.unlinkSync(file.path);
            res.status(400).json({ error: 'Unsupported file type. Use JSON or CSV.' });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Single requirement CRUD
router.post('/:fileType/requirements', (req, res) => {
    try {
        const { projectId, fileType } = req.params as any;
        const requirement = FileService.addRequirement(projectId, fileType, req.body);
        broadcast({ type: 'REQUIREMENT_CREATED', projectId, fileType, data: requirement });
        res.status(201).json(requirement);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:fileType/requirements/bulk', (req, res) => {
    try {
        const { projectId, fileType } = req.params as any;
        const updates = req.body;
        if (!Array.isArray(updates)) return res.status(400).json({ error: 'Body must be an array of updates' });
        const updated = FileService.bulkUpdateRequirements(projectId, fileType, updates);
        broadcast({ type: 'REQUIREMENTS_BULK_UPDATED', projectId, fileType, data: updated });
        res.json(updated);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:fileType/requirements/bulk', (req, res) => {
    try {
        const { projectId, fileType } = req.params as any;
        const reqIds = req.body; // expecting array of string IDs
        if (!Array.isArray(reqIds)) return res.status(400).json({ error: 'Body must be an array of IDs' });
        FileService.bulkDeleteRequirements(projectId, fileType, reqIds);
        broadcast({ type: 'REQUIREMENTS_BULK_DELETED', projectId, fileType, data: reqIds });
        res.status(204).send();
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:fileType/requirements/:reqId', (req, res) => {
    try {
        const { projectId, fileType, reqId } = req.params as any;
        const updated = FileService.updateRequirement(projectId, fileType, reqId, req.body);
        broadcast({ type: 'REQUIREMENT_UPDATED', projectId, fileType, data: updated });
        res.json(updated);
    } catch (err: any) {
        res.status(404).json({ error: err.message });
    }
});

router.delete('/:fileType/requirements/:reqId', (req, res) => {
    try {
        const { projectId, fileType, reqId } = req.params as any;
        FileService.deleteRequirement(projectId, fileType, reqId);
        broadcast({ type: 'REQUIREMENT_DELETED', projectId, fileType, data: { id: reqId } });
        res.status(204).send();
    } catch (err: any) {
        res.status(404).json({ error: err.message });
    }
});

router.post('/:fileType/requirements/:reqId/change-type', (req, res) => {
    try {
        const { projectId, fileType, reqId } = req.params as any;
        const { newFileType } = req.body;
        if (!newFileType) return res.status(400).json({ error: 'newFileType is required' });
        
        const newReq = FileService.changeRequirementType(projectId, fileType, reqId, newFileType);
        broadcast({ type: 'REQUIREMENT_TYPE_CHANGED', projectId, oldFileType: fileType, newFileType, data: newReq });
        res.json(newReq);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
