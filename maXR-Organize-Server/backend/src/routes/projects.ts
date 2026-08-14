import { Router } from 'express';
import { ProjectService } from '../services/projectService';
import { broadcast } from '../index';
import filesRouter from './files';

const router = Router();

router.get('/', (req, res) => {
    try {
        const projects = ProjectService.getProjects();
        res.json(projects);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const project = ProjectService.createProject(name);
        broadcast({ type: 'PROJECT_CREATED', data: project });
        res.status(201).json(project);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', (req, res) => {
    try {
        ProjectService.deleteProject(req.params.id);
        broadcast({ type: 'PROJECT_DELETED', data: { id: req.params.id } });
        res.status(204).send();
    } catch (err: any) {
        res.status(404).json({ error: err.message });
    }
});

// Nested routes for files
router.use('/:projectId/files', filesRouter);

export default router;
