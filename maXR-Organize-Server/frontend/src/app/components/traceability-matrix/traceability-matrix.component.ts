import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import { ProjectService } from '../../services/project.service';

interface TreeNode {
  req: any;
  type: string;
  children: TreeNode[];
}

@Component({
  selector: 'app-traceability-matrix',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="matrix-container">
      <header class="glass-panel header">
        <div class="title-group">
          <button mat-icon-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h1>Traceability Matrix</h1>
        </div>
      </header>

      <div class="glass-panel content">
        <div *ngIf="loading" class="loading-state">Loading matrix...</div>
        
        <div *ngIf="!loading && tree.length === 0 && orphans.length === 0" class="empty-state">
          No requirements found in this project.
        </div>

        <div *ngIf="!loading">
          <h2>End-to-End Traces</h2>
          <div class="tree-root">
            <ng-container *ngTemplateOutlet="nodeTemplate; context: { $implicit: tree }"></ng-container>
          </div>
          
          <div *ngIf="orphans.length > 0" class="orphans-section">
            <h2>Orphaned Requirements</h2>
            <p class="subtitle">These requirements have no parent links.</p>
            <div class="tree-root">
              <ng-container *ngTemplateOutlet="nodeTemplate; context: { $implicit: orphans }"></ng-container>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recursive Template for Tree Nodes -->
    <ng-template #nodeTemplate let-nodes>
      <ul class="tree-list">
        <li *ngFor="let node of nodes" class="tree-item">
          <div class="node-content">
            <span class="trace-badge" 
                  (click)="navigateToRequirement(node.req.id, node.type)"
                  [matTooltip]="getTooltip(node.req)"
                  matTooltipClass="trace-tooltip">
              {{node.req.name}}
            </span>
            <span class="node-title">{{node.req.title}}</span>
          </div>
          
          <ng-container *ngIf="node.children && node.children.length > 0">
            <ng-container *ngTemplateOutlet="nodeTemplate; context: { $implicit: node.children }"></ng-container>
          </ng-container>
        </li>
      </ul>
    </ng-template>
  `,
  styles: [`
    .matrix-container {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      align-items: center;
      padding: 1rem 1.5rem;
      margin-bottom: 2rem;
    }
    .title-group {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    h1 { margin: 0; color: var(--primary-color); font-weight: 600; }
    h2 { color: var(--text-primary); margin-top: 0; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); }
    .subtitle { color: var(--text-secondary); font-size: 0.9rem; margin-top: -0.5rem; margin-bottom: 1rem; }
    .content { padding: 2rem; }
    .loading-state, .empty-state { text-align: center; padding: 3rem; color: var(--text-secondary); }
    
    .orphans-section { margin-top: 3rem; }

    .tree-root > .tree-list {
      padding-left: 0;
    }
    .tree-list {
      list-style-type: none;
      padding-left: 2rem;
      margin: 0.5rem 0;
    }
    .tree-item {
      position: relative;
      margin-bottom: 0.5rem;
    }
    /* Tree connecting lines */
    .tree-list .tree-item::before {
      content: '';
      position: absolute;
      top: -0.5rem;
      left: -1rem;
      border-left: 2px solid var(--border-color);
      height: 100%;
    }
    .tree-root > .tree-list > .tree-item::before {
      display: none;
    }
    .tree-list .tree-item::after {
      content: '';
      position: absolute;
      top: 14px;
      left: -1rem;
      border-bottom: 2px solid var(--border-color);
      width: 1rem;
    }
    .tree-root > .tree-list > .tree-item::after {
      display: none;
    }
    .tree-list .tree-item:last-child::before {
      height: 22px;
    }

    .node-content {
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(0, 0, 0, 0.15);
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      width: fit-content;
      transition: background 0.2s;
    }
    .node-content:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .node-title {
      font-size: 0.95rem;
      color: var(--text-primary);
    }
    
    .trace-badge {
      display: inline-block;
      background: rgba(99, 102, 241, 0.2);
      color: #818cf8;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      cursor: pointer;
      transition: background 0.2s;
      font-weight: 500;
    }
    .trace-badge:hover {
      background: rgba(99, 102, 241, 0.4);
    }
  `]
})
export class TraceabilityMatrixComponent implements OnInit {
  projectId: string = '';
  loading = true;
  tree: TreeNode[] = [];
  orphans: TreeNode[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService
  ) {}

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id') || '';
    this.loadMatrix();
  }

  goBack() {
    this.router.navigate(['/projects', this.projectId]);
  }

  loadMatrix() {
    forkJoin({
      ur: this.projectService.getFiles(this.projectId, 'user'),
      sr: this.projectService.getFiles(this.projectId, 'system'),
      dir: this.projectService.getFiles(this.projectId, 'design_input'),
      swr: this.projectService.getFiles(this.projectId, 'software')
    }).subscribe(results => {
      this.buildTree(results.ur, results.sr, results.dir, results.swr);
      this.loading = false;
    });
  }

  buildTree(urs: any[], srs: any[], dirs: any[], swrs: any[]) {
    const usedSRs = new Set<string>();
    const usedDIRs = new Set<string>();
    const usedSWRs = new Set<string>();

    // Build the main tree starting from URs
    this.tree = urs.map(ur => {
      // Find linked SRs
      const linkedSRs = srs.filter(sr => (sr.traceLinks || []).includes(ur.id));
      
      const srNodes = linkedSRs.map(sr => {
        usedSRs.add(sr.id);
        
        // Find linked DIRs and SWRs
        const linkedDIRs = dirs.filter(dir => (dir.traceLinks || []).includes(sr.id));
        const linkedSWRs = swrs.filter(swr => (swr.traceLinks || []).includes(sr.id));
        
        const childNodes = [
          ...linkedDIRs.map(dir => {
            usedDIRs.add(dir.id);
            return { req: dir, type: 'design_input', children: [] };
          }),
          ...linkedSWRs.map(swr => {
            usedSWRs.add(swr.id);
            return { req: swr, type: 'software', children: [] };
          })
        ];

        return { req: sr, type: 'system', children: childNodes };
      });

      return { req: ur, type: 'user', children: srNodes };
    });

    // Build orphans
    this.orphans = [];
    srs.filter(sr => !usedSRs.has(sr.id)).forEach(sr => {
      // Find children of this orphaned SR just in case
      const linkedDIRs = dirs.filter(dir => (dir.traceLinks || []).includes(sr.id));
      const linkedSWRs = swrs.filter(swr => (swr.traceLinks || []).includes(sr.id));
      
      const childNodes = [
        ...linkedDIRs.map(dir => {
          usedDIRs.add(dir.id);
          return { req: dir, type: 'design_input', children: [] };
        }),
        ...linkedSWRs.map(swr => {
          usedSWRs.add(swr.id);
          return { req: swr, type: 'software', children: [] };
        })
      ];
      this.orphans.push({ req: sr, type: 'system', children: childNodes });
    });

    dirs.filter(dir => !usedDIRs.has(dir.id)).forEach(dir => {
      this.orphans.push({ req: dir, type: 'design_input', children: [] });
    });

    swrs.filter(swr => !usedSWRs.has(swr.id)).forEach(swr => {
      this.orphans.push({ req: swr, type: 'software', children: [] });
    });
  }

  getTooltip(req: any): string {
    return `${req.title}\n\n${req.description}`;
  }

  navigateToRequirement(id: string, type: string) {
    this.router.navigate(['/projects', this.projectId, 'editor', type], { fragment: id });
  }
}
