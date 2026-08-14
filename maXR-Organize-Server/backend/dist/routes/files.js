"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fileService_1 = require("../services/fileService");
const index_1 = require("../index");
const csv_parser_1 = __importDefault(require("csv-parser"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)({ mergeParams: true });
const upload = (0, multer_1.default)({ dest: 'uploads/' });
// Get all requirements in a file
router.get('/:fileType', (req, res) => {
    try {
        const { projectId, fileType } = req.params;
        const requirements = fileService_1.FileService.getRequirements(projectId, fileType);
        res.json(requirements);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
// Upload CSV or JSON to replace a file
router.post('/:fileType', upload.single('file'), (req, res) => {
    try {
        const { projectId, fileType } = req.params;
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: 'No file uploaded' });
        if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
            const data = JSON.parse(fs_1.default.readFileSync(file.path, 'utf8'));
            fileService_1.FileService.replaceFile(projectId, fileType, data);
            (0, index_1.broadcast)({ type: 'FILE_REPLACED', projectId, fileType, data });
            fs_1.default.unlinkSync(file.path);
            res.json({ message: 'File replaced successfully' });
        }
        else if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            const results = [];
            fs_1.default.createReadStream(file.path)
                .pipe((0, csv_parser_1.default)())
                .on('data', (data) => results.push(data))
                .on('end', () => {
                fileService_1.FileService.replaceFile(projectId, fileType, results);
                (0, index_1.broadcast)({ type: 'FILE_REPLACED', projectId, fileType, data: results });
                fs_1.default.unlinkSync(file.path);
                res.json({ message: 'File replaced successfully' });
            });
        }
        else {
            fs_1.default.unlinkSync(file.path);
            res.status(400).json({ error: 'Unsupported file type. Use JSON or CSV.' });
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Single requirement CRUD
router.post('/:fileType/requirements', (req, res) => {
    try {
        const { projectId, fileType } = req.params;
        const requirement = fileService_1.FileService.addRequirement(projectId, fileType, req.body);
        (0, index_1.broadcast)({ type: 'REQUIREMENT_CREATED', projectId, fileType, data: requirement });
        res.status(201).json(requirement);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.put('/:fileType/requirements/bulk', (req, res) => {
    try {
        const { projectId, fileType } = req.params;
        const updates = req.body;
        if (!Array.isArray(updates))
            return res.status(400).json({ error: 'Body must be an array of updates' });
        const updated = fileService_1.FileService.bulkUpdateRequirements(projectId, fileType, updates);
        (0, index_1.broadcast)({ type: 'REQUIREMENTS_BULK_UPDATED', projectId, fileType, data: updated });
        res.json(updated);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.delete('/:fileType/requirements/bulk', (req, res) => {
    try {
        const { projectId, fileType } = req.params;
        const reqIds = req.body; // expecting array of string IDs
        if (!Array.isArray(reqIds))
            return res.status(400).json({ error: 'Body must be an array of IDs' });
        fileService_1.FileService.bulkDeleteRequirements(projectId, fileType, reqIds);
        (0, index_1.broadcast)({ type: 'REQUIREMENTS_BULK_DELETED', projectId, fileType, data: reqIds });
        res.status(204).send();
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.put('/:fileType/requirements/:reqId', (req, res) => {
    try {
        const { projectId, fileType, reqId } = req.params;
        const updated = fileService_1.FileService.updateRequirement(projectId, fileType, reqId, req.body);
        (0, index_1.broadcast)({ type: 'REQUIREMENT_UPDATED', projectId, fileType, data: updated });
        res.json(updated);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
router.delete('/:fileType/requirements/:reqId', (req, res) => {
    try {
        const { projectId, fileType, reqId } = req.params;
        fileService_1.FileService.deleteRequirement(projectId, fileType, reqId);
        (0, index_1.broadcast)({ type: 'REQUIREMENT_DELETED', projectId, fileType, data: { id: reqId } });
        res.status(204).send();
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
router.post('/:fileType/requirements/:reqId/change-type', (req, res) => {
    try {
        const { projectId, fileType, reqId } = req.params;
        const { newFileType } = req.body;
        if (!newFileType)
            return res.status(400).json({ error: 'newFileType is required' });
        const newReq = fileService_1.FileService.changeRequirementType(projectId, fileType, reqId, newFileType);
        (0, index_1.broadcast)({ type: 'REQUIREMENT_TYPE_CHANGED', projectId, oldFileType: fileType, newFileType, data: newReq });
        res.json(newReq);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.default = router;
