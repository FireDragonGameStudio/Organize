import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { ProjectService } from '../../services/project.service';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-project-details',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
  template: `
    <div class="details-container">
      <header class="glass-panel header">
        <div class="title-group">
          <button mat-icon-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h1>Project: {{ projectId }}</h1>
        </div>
        <div class="action-group">
          <button mat-flat-button color="primary" (click)="openGraph3d()">
            <mat-icon>3d_rotation</mat-icon> 3D Graph
          </button>
          <button mat-flat-button color="accent" (click)="openMatrix()">
            <mat-icon>account_tree</mat-icon> Traceability Matrix
          </button>
        </div>
      </header>

      <div class="file-grid">
        <mat-card *ngFor="let file of fileTypes" class="glass-panel file-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="file-icon">description</mat-icon>
            <mat-card-title>{{ file.label }}</mat-card-title>
            <mat-card-subtitle>{{ file.type }}.json</mat-card-subtitle>
          </mat-card-header>
          <mat-card-actions>
            <button mat-button color="primary" (click)="openEditor(file.type)">Open Editor</button>
            <button mat-button color="accent" (click)="fileInput.click()">
              <mat-icon>upload</mat-icon> Upload
            </button>
            <input type="file" #fileInput (change)="onFileUpload($event, file.type)" style="display: none" accept=".json,.csv">
          </mat-card-actions>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .details-container {
      padding: 2rem;
      max-width: 1000px;
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
    .action-group {
      display: flex;
      gap: 1rem;
    }
    h1 {
      margin: 0;
      color: var(--primary-color);
      font-weight: 600;
    }
    .file-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.5rem;
    }
    .file-card {
      transition: transform 0.2s;
    }
    .file-card:hover {
      transform: translateY(-4px);
    }
    .file-icon {
      color: var(--secondary-color);
      transform: scale(1.5);
      margin-top: 8px;
    }
    mat-card-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `]
})
export class ProjectDetailsComponent implements OnInit {
  projectId: string = '';
  fileTypes = [
    { type: 'user', label: 'User Requirements' },
    { type: 'system', label: 'System Requirements' },
    { type: 'design_input', label: 'Design Input Requirements' },
    { type: 'software', label: 'Software Requirements' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id') || '';
  }

  goBack() {
    this.router.navigate(['/']);
  }

  openEditor(fileType: string) {
    this.router.navigate(['/projects', this.projectId, 'editor', fileType]);
  }

  openMatrix() {
    this.router.navigate(['/projects', this.projectId, 'matrix']);
  }

  openGraph3d() {
    this.router.navigate(['/projects', this.projectId, '3d-graph']);
  }

  onFileUpload(event: any, fileType: string) {
    const file = event.target.files[0];
    if (file) {
      this.projectService.uploadFile(this.projectId, fileType, file).subscribe({
        next: () => {
          this.dialog.open(ConfirmDialogComponent, {
            width: '400px',
            panelClass: 'glass-dialog-panel',
            data: {
              title: 'Upload Successful',
              message: 'File uploaded and replaced successfully!',
              confirmText: 'OK',
              isAlert: true
            }
          });
          event.target.value = '';
        },
        error: (err) => { }
      });
    }
  }
}
