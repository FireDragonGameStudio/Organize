"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const projectService_1 = require("../services/projectService");
const index_1 = require("../index");
const files_1 = __importDefault(require("./files"));
const router = (0, express_1.Router)();
router.get('/', (req, res) => {
    try {
        const projects = projectService_1.ProjectService.getProjects();
        res.json(projects);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/', (req, res) => {
    try {
        const { name } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Name is required' });
        const project = projectService_1.ProjectService.createProject(name);
        (0, index_1.broadcast)({ type: 'PROJECT_CREATED', data: project });
        res.status(201).json(project);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.delete('/:id', (req, res) => {
    try {
        projectService_1.ProjectService.deleteProject(req.params.id);
        (0, index_1.broadcast)({ type: 'PROJECT_DELETED', data: { id: req.params.id } });
        res.status(204).send();
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
// Nested routes for files
router.use('/:projectId/files', files_1.default);
exports.default = router;
