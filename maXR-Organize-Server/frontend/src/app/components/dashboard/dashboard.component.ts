import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ProjectService, Project } from '../../services/project.service';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatInputModule, FormsModule],
  template: `
    <div class="dashboard-container">
      <header class="glass-panel header">
        <h1>maXR Projects</h1>
        <div class="create-project">
          <mat-form-field appearance="outline" class="project-input">
            <mat-label>New Project Name</mat-label>
            <input matInput [(ngModel)]="newProjectName" (keyup.enter)="createProject()">
          </mat-form-field>
          <button mat-flat-button color="primary" (click)="createProject()" [disabled]="!newProjectName">
            <mat-icon>add</mat-icon> Create Project
          </button>
        </div>
      </header>

      <div class="project-grid">
        <mat-card *ngFor="let project of projects" class="glass-panel project-card">
          <mat-card-header>
            <mat-card-title>{{ project.name }}</mat-card-title>
            <mat-card-subtitle>Created: {{ project.createdAt | date }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-actions>
            <button mat-button color="primary" (click)="openProject(project.id)">Open</button>
            <button mat-icon-button color="warn" (click)="deleteProject(project.id)">
              <mat-icon>delete</mat-icon>
            </button>
          </mat-card-actions>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem 2rem;
      margin-bottom: 2rem;
    }
    h1 {
      margin: 0;
      background: linear-gradient(to right, var(--primary-color), var(--secondary-color));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 700;
    }
    .create-project {
      display: flex;
      gap: 1rem;
      align-items: center;
    }
    .project-input {
      margin-bottom: -1.34375em;
    }
    .project-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }
    .project-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .project-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.5);
    }
    mat-card-actions {
      display: flex;
      justify-content: space-between;
      padding: 8px 16px;
    }
  `]
})
export class DashboardComponent implements OnInit {
  projects: Project[] = [];
  newProjectName = '';

  constructor(
    private projectService: ProjectService,
    private router: Router,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.loadProjects();
  }

  loadProjects() {
    this.projectService.getProjects().subscribe(projects => {
      this.projects = projects;
    });
  }

  createProject() {
    if (this.newProjectName.trim()) {
      this.projectService.createProject(this.newProjectName.trim()).subscribe(() => {
        this.newProjectName = '';
        this.loadProjects();
      });
    }
  }

  deleteProject(id: string) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      panelClass: 'glass-dialog-panel',
      data: {
        title: 'Delete Project',
        message: 'Are you sure you want to delete this project?',
        confirmText: 'Delete'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.projectService.deleteProject(id).subscribe(() => {
          this.loadProjects();
        });
      }
    });
  }

  openProject(id: string) {
    this.router.navigate(['/projects', id]);
  }
}
