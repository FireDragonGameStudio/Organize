"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const DATA_DIR = path_1.default.join(__dirname, '../../data/projects');
const VALID_TYPES = ['user', 'system', 'design_input', 'software'];
class FileService {
    static getFilePath(projectId, fileType) {
        if (!VALID_TYPES.includes(fileType)) {
            throw new Error('Invalid requirement file type');
        }
        return path_1.default.join(DATA_DIR, projectId, `${fileType}.json`);
    }
    static getRequirements(projectId, fileType) {
        const filePath = this.getFilePath(projectId, fileType);
        if (!fs_1.default.existsSync(filePath)) {
            return [];
        }
        return JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
    }
    static findTargetFileType(projectId, reqId) {
        for (const ft of VALID_TYPES) {
            const reqs = this.getRequirements(projectId, ft);
            if (reqs.some((r) => r.id === reqId))
                return ft;
        }
        return null;
    }
    static syncTraceLinks(projectId, reqId, oldLinks, newLinks) {
        const added = newLinks.filter(l => !oldLinks.includes(l));
        const removed = oldLinks.filter(l => !newLinks.includes(l));
        const updateLinkInTarget = (targetId, action) => {
            const targetFileType = this.findTargetFileType(projectId, targetId);
            if (!targetFileType)
                return;
            const filePath = this.getFilePath(projectId, targetFileType);
            if (fs_1.default.existsSync(filePath)) {
                const reqs = JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
                const targetReq = reqs.find((r) => r.id === targetId);
                if (targetReq) {
                    targetReq.traceLinks = targetReq.traceLinks || [];
                    if (action === 'add' && !targetReq.traceLinks.includes(reqId)) {
                        targetReq.traceLinks.push(reqId);
                        this.replaceFile(projectId, targetFileType, reqs);
                    }
                    else if (action === 'remove' && targetReq.traceLinks.includes(reqId)) {
                        targetReq.traceLinks = targetReq.traceLinks.filter((id) => id !== reqId);
                        this.replaceFile(projectId, targetFileType, reqs);
                    }
                }
            }
        };
        added.forEach(id => updateLinkInTarget(id, 'add'));
        removed.forEach(id => updateLinkInTarget(id, 'remove'));
    }
    static replaceFile(projectId, fileType, data) {
        const filePath = this.getFilePath(projectId, fileType);
        fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    static addRequirement(projectId, fileType, requirement) {
        const requirements = this.getRequirements(projectId, fileType);
        requirement.id = requirement.id || crypto_1.default.randomUUID();
        if (!requirement.name) {
            let prefix = '';
            if (fileType === 'user')
                prefix = 'UR-';
            else if (fileType === 'system')
                prefix = 'SR-';
            else if (fileType === 'design_input')
                prefix = 'DIR-';
            else if (fileType === 'software')
                prefix = 'SWR-';
            requirement.name = `${prefix}${Date.now().toString().slice(-6)}`;
        }
        requirement.traceLinks = requirement.traceLinks || [];
        requirements.push(requirement);
        this.replaceFile(projectId, fileType, requirements);
        this.syncTraceLinks(projectId, requirement.id, [], requirement.traceLinks);
        return requirement;
    }
    static updateRequirement(projectId, fileType, reqId, updatedReq) {
        const requirements = this.getRequirements(projectId, fileType);
        const index = requirements.findIndex(r => r.id === reqId);
        if (index === -1) {
            throw new Error('Requirement not found');
        }
        const oldLinks = requirements[index].traceLinks || [];
        requirements[index] = { ...requirements[index], ...updatedReq, id: reqId };
        const newLinks = requirements[index].traceLinks || [];
        this.replaceFile(projectId, fileType, requirements);
        this.syncTraceLinks(projectId, reqId, oldLinks, newLinks);
        return requirements[index];
    }
    static deleteRequirement(projectId, fileType, reqId) {
        const requirements = this.getRequirements(projectId, fileType);
        const index = requirements.findIndex(r => r.id === reqId);
        if (index === -1) {
            throw new Error('Requirement not found');
        }
        const oldLinks = requirements[index].traceLinks || [];
        requirements.splice(index, 1);
        this.replaceFile(projectId, fileType, requirements);
        this.syncTraceLinks(projectId, reqId, oldLinks, []);
    }
    static bulkUpdateRequirements(projectId, fileType, updates) {
        const requirements = this.getRequirements(projectId, fileType);
        const updatedReqs = [];
        updates.forEach(update => {
            const index = requirements.findIndex(r => r.id === update.id);
            if (index !== -1) {
                const oldLinks = requirements[index].traceLinks || [];
                requirements[index] = { ...requirements[index], ...update };
                const newLinks = requirements[index].traceLinks || [];
                updatedReqs.push(requirements[index]);
                this.syncTraceLinks(projectId, update.id, oldLinks, newLinks);
            }
        });
        this.replaceFile(projectId, fileType, requirements);
        return updatedReqs;
    }
    static bulkDeleteRequirements(projectId, fileType, reqIds) {
        const requirements = this.getRequirements(projectId, fileType);
        reqIds.forEach(id => {
            const req = requirements.find(r => r.id === id);
            if (req) {
                this.syncTraceLinks(projectId, id, req.traceLinks || [], []);
            }
        });
        const filtered = requirements.filter(r => !reqIds.includes(r.id));
        this.replaceFile(projectId, fileType, filtered);
    }
    static changeRequirementType(projectId, oldFileType, reqId, newFileType) {
        if (!VALID_TYPES.includes(newFileType))
            throw new Error('Invalid new file type');
        if (oldFileType === newFileType)
            return this.getRequirements(projectId, oldFileType).find(r => r.id === reqId);
        const oldReqs = this.getRequirements(projectId, oldFileType);
        const index = oldReqs.findIndex(r => r.id === reqId);
        if (index === -1)
            throw new Error('Requirement not found');
        const req = oldReqs[index];
        let prefix = '';
        let typeVal = '';
        if (newFileType === 'user') {
            prefix = 'UR-';
            typeVal = 'UR';
        }
        else if (newFileType === 'system') {
            prefix = 'SR-';
            typeVal = 'SR';
        }
        else if (newFileType === 'design_input') {
            prefix = 'DIR-';
            typeVal = 'DIR';
        }
        else if (newFileType === 'software') {
            prefix = 'SWR-';
            typeVal = 'SWR';
        }
        const newName = `${prefix}${Date.now().toString().slice(-6)}`;
        // Remove from old file
        oldReqs.splice(index, 1);
        this.replaceFile(projectId, oldFileType, oldReqs);
        // Add to new file
        const newReqs = this.getRequirements(projectId, newFileType);
        const newReq = {
            ...req,
            name: newName,
            type: typeVal
        };
        newReqs.push(newReq);
        this.replaceFile(projectId, newFileType, newReqs);
        return newReq;
    }
}
exports.FileService = FileService;
