"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(__dirname, '../../data/projects');
// Ensure data directory exists
if (!fs_1.default.existsSync(DATA_DIR)) {
    fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
}
class ProjectService {
    static getProjects() {
        if (!fs_1.default.existsSync(DATA_DIR))
            return [];
        const dirs = fs_1.default.readdirSync(DATA_DIR, { withFileTypes: true });
        return dirs
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
            const metaPath = path_1.default.join(DATA_DIR, dirent.name, 'meta.json');
            if (fs_1.default.existsSync(metaPath)) {
                return JSON.parse(fs_1.default.readFileSync(metaPath, 'utf8'));
            }
            return { id: dirent.name, name: dirent.name, createdAt: new Date().toISOString() };
        });
    }
    static createProject(name) {
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const projectDir = path_1.default.join(DATA_DIR, id);
        if (fs_1.default.existsSync(projectDir)) {
            throw new Error('Project already exists');
        }
        fs_1.default.mkdirSync(projectDir, { recursive: true });
        const project = { id, name, createdAt: new Date().toISOString() };
        fs_1.default.writeFileSync(path_1.default.join(projectDir, 'meta.json'), JSON.stringify(project, null, 2));
        // Create empty requirement files
        const fileTypes = ['user', 'system', 'design_input', 'software'];
        fileTypes.forEach(type => {
            fs_1.default.writeFileSync(path_1.default.join(projectDir, `${type}.json`), JSON.stringify([]));
        });
        return project;
    }
    static deleteProject(id) {
        const projectDir = path_1.default.join(DATA_DIR, id);
        if (fs_1.default.existsSync(projectDir)) {
            fs_1.default.rmSync(projectDir, { recursive: true, force: true });
        }
        else {
            throw new Error('Project not found');
        }
    }
}
exports.ProjectService = ProjectService;
