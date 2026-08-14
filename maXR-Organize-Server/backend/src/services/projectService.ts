import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '../../data/projects');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface Project {
    id: string;
    name: string;
    createdAt: string;
}

export class ProjectService {
    static getProjects(): Project[] {
        if (!fs.existsSync(DATA_DIR)) return [];
        const dirs = fs.readdirSync(DATA_DIR, { withFileTypes: true });
        return dirs
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
                const metaPath = path.join(DATA_DIR, dirent.name, 'meta.json');
                if (fs.existsSync(metaPath)) {
                    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                }
                return { id: dirent.name, name: dirent.name, createdAt: new Date().toISOString() };
            });
    }

    static createProject(name: string): Project {
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const projectDir = path.join(DATA_DIR, id);
        
        if (fs.existsSync(projectDir)) {
            throw new Error('Project already exists');
        }

        fs.mkdirSync(projectDir, { recursive: true });
        const project: Project = { id, name, createdAt: new Date().toISOString() };
        fs.writeFileSync(path.join(projectDir, 'meta.json'), JSON.stringify(project, null, 2));
        
        // Create empty requirement files
        const fileTypes = ['user', 'system', 'design_input', 'software'];
        fileTypes.forEach(type => {
            fs.writeFileSync(path.join(projectDir, `${type}.json`), JSON.stringify([]));
        });

        return project;
    }

    static deleteProject(id: string): void {
        const projectDir = path.join(DATA_DIR, id);
        if (fs.existsSync(projectDir)) {
            fs.rmSync(projectDir, { recursive: true, force: true });
        } else {
            throw new Error('Project not found');
        }
    }
}
