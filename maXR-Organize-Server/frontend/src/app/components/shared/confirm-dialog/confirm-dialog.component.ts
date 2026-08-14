import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isAlert?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title class="dialog-title">{{ data.title }}</h2>
    <mat-dialog-content class="dialog-content">
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="dialog-actions">
      <button *ngIf="!data.isAlert" mat-button (click)="onCancel()" class="cancel-btn">
        {{ data.cancelText || 'Cancel' }}
      </button>
      <button mat-flat-button color="primary" (click)="onConfirm()" class="confirm-btn">
        {{ data.confirmText || 'OK' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
      background: rgba(30, 41, 59, 0.95);
      backdrop-filter: blur(20px);
      color: #f8fafc;
      padding: 1.5rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
    }
    .dialog-title {
      margin: 0 0 1rem 0;
      color: #60a5fa;
      font-weight: 600;
    }
    .dialog-content {
      font-size: 1.1rem;
      color: #cbd5e1;
      margin-bottom: 1.5rem;
    }
    .dialog-actions {
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .cancel-btn {
      color: #94a3b8;
    }
    .confirm-btn {
      background-color: #6366f1;
      color: white;
    }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {}

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
