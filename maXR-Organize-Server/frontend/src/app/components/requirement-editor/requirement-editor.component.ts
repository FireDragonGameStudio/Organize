import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SelectionModel } from '@angular/cdk/collections';
import { forkJoin } from 'rxjs';
import { ProjectService } from '../../services/project.service';
import { WebsocketService } from '../../services/websocket.service';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-requirement-editor',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule, MatInputModule, MatCheckboxModule, MatSelectModule, MatTooltipModule, FormsModule, MatDialogModule, MatSnackBarModule],
  template: `
    <div class="editor-container">
      <header class="glass-panel header">
        <div class="title-group">
          <button mat-icon-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h1>{{ fileType | titlecase }} Requirements</h1>
        </div>
        <div class="action-group">
          <!-- Bulk Actions Toolbar -->
          <ng-container *ngIf="selection.hasValue()">
            <span class="selection-count">{{selection.selected.length}} selected</span>
            <button mat-stroked-button color="primary" (click)="bulkEdit()" *ngIf="!isBulkEditing">
              <mat-icon>edit</mat-icon> Bulk Edit
            </button>
            <button mat-flat-button color="primary" (click)="bulkSave()" *ngIf="isBulkEditing">
              <mat-icon>save</mat-icon> Save Selected
            </button>
            <button mat-flat-button color="warn" (click)="deleteSelected()">
              <mat-icon>delete</mat-icon> Bulk Delete
            </button>
          </ng-container>
          
          <button mat-stroked-button color="warn" (click)="resetColumns()" *ngIf="!isBulkEditing" title="Reset column widths to default">
            <mat-icon>view_column</mat-icon> Reset Columns
          </button>
          
          <button mat-flat-button color="accent" (click)="addRequirement()">
            <mat-icon>add</mat-icon> Add Requirement
          </button>
        </div>
      </header>

      <div class="glass-panel table-container">
        <table mat-table [dataSource]="requirements" class="req-table">
          
          <!-- Checkbox Column -->
          <ng-container matColumnDef="select">
            <th mat-header-cell *matHeaderCellDef>
              <mat-checkbox (change)="$event ? toggleAllRows() : null"
                            [checked]="selection.hasValue() && isAllSelected()"
                            [indeterminate]="selection.hasValue() && !isAllSelected()">
              </mat-checkbox>
            </th>
            <td mat-cell *matCellDef="let row">
              <mat-checkbox (click)="$event.stopPropagation()"
                            (change)="$event ? selection.toggle(row) : null"
                            [checked]="selection.isSelected(row)">
              </mat-checkbox>
            </td>
          </ng-container>

          <!-- ID Column -->
          <ng-container matColumnDef="id">
            <th mat-header-cell *matHeaderCellDef class="resizable-header" [style.width.px]="columnWidths['id']"> 
              ID 
              <div class="resize-handle" (mousedown)="onResizeStart($event, 'id')"></div>
            </th>
            <td mat-cell *matCellDef="let req" class="id-cell" [style.maxWidth.px]="columnWidths['id'] || 100"> 
              <span class="id-text" [title]="req.id">{{req.id}}</span> 
            </td>
          </ng-container>

          <!-- Name Column -->
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef class="resizable-header" [style.width.px]="columnWidths['name']"> 
              Name 
              <div class="resize-handle" (mousedown)="onResizeStart($event, 'name')"></div>
            </th>
            <td mat-cell *matCellDef="let req"> {{req.name}} </td>
          </ng-container>

          <!-- Title Column -->
          <ng-container matColumnDef="title">
            <th mat-header-cell *matHeaderCellDef class="resizable-header" [style.width.px]="columnWidths['title']"> 
              Title 
              <div class="resize-handle" (mousedown)="onResizeStart($event, 'title')"></div>
            </th>
            <td mat-cell *matCellDef="let req">
              <input *ngIf="req.isEditing" [(ngModel)]="req.title" class="edit-input">
              <span *ngIf="!req.isEditing">{{req.title}}</span>
            </td>
          </ng-container>

          <!-- Description Column -->
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef class="resizable-header" [style.width.px]="columnWidths['description']"> 
              Description 
              <div class="resize-handle" (mousedown)="onResizeStart($event, 'description')"></div>
            </th>
            <td mat-cell *matCellDef="let req">
              <input *ngIf="req.isEditing" [(ngModel)]="req.description" class="edit-input">
              <span *ngIf="!req.isEditing">{{req.description}}</span>
            </td>
          </ng-container>

          <!-- Traced By Column -->
          <ng-container matColumnDef="tracedBy">
            <th mat-header-cell *matHeaderCellDef class="resizable-header" [style.width.px]="columnWidths['tracedBy']"> 
              Traced By 
              <div class="resize-handle" (mousedown)="onResizeStart($event, 'tracedBy')"></div>
            </th>
            <td mat-cell *matCellDef="let req">
              <mat-select *ngIf="req.isEditing" [(ngModel)]="req.tracedBy" multiple class="edit-input">
                <mat-option *ngFor="let target of availableTracedBy" [value]="target.id">
                  {{target.name}}
                </mat-option>
              </mat-select>
              <span *ngIf="!req.isEditing">
                <span class="trace-badge" *ngFor="let link of req.tracedBy" 
                      (click)="navigateToRequirement(link)"
                      [matTooltip]="getTargetTooltip(link)"
                      matTooltipClass="trace-tooltip">
                  {{getTargetDetails(link).name || link}}
                </span>
              </span>
            </td>
          </ng-container>

          <!-- Traces To Column -->
          <ng-container matColumnDef="tracesTo">
            <th mat-header-cell *matHeaderCellDef class="resizable-header" [style.width.px]="columnWidths['tracesTo']"> 
              Traces To 
              <div class="resize-handle" (mousedown)="onResizeStart($event, 'tracesTo')"></div>
            </th>
            <td mat-cell *matCellDef="let req">
              <mat-select *ngIf="req.isEditing" [(ngModel)]="req.tracesTo" multiple class="edit-input">
                <mat-option *ngFor="let target of availableTracesTo" [value]="target.id">
                  {{target.name}}
                </mat-option>
              </mat-select>
              <span *ngIf="!req.isEditing">
                <span class="trace-badge" *ngFor="let link of req.tracesTo" 
                      (click)="navigateToRequirement(link)"
                      [matTooltip]="getTargetTooltip(link)"
                      matTooltipClass="trace-tooltip">
                  {{getTargetDetails(link).name || link}}
                </span>
              </span>
            </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef> Actions </th>
            <td mat-cell *matCellDef="let req">
              <button *ngIf="!req.isEditing" mat-icon-button color="primary" (click)="req.isEditing = true" [disabled]="isBulkEditing">
                <mat-icon>edit</mat-icon>
              </button>
              <button *ngIf="req.isEditing" mat-icon-button color="primary" (click)="saveRequirement(req)">
                <mat-icon>save</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="deleteRequirement(req, $event)" [disabled]="isBulkEditing">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;" [id]="row.id" class="req-row"></tr>
        </table>
        
        <div *ngIf="requirements.length === 0" class="empty-state">
          No requirements found. Add one to get started.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .editor-container {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
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
      align-items: center;
      gap: 1rem;
    }
    .selection-count {
      color: var(--text-secondary);
      font-weight: 500;
      margin-right: 8px;
    }
    h1 {
      margin: 0;
      color: var(--primary-color);
      font-weight: 600;
    }
    .table-container {
      /* Removed overflow: hidden to prevent clipping tooltips */
      position: relative;
      z-index: 1;
    }
    .req-table {
      width: 100%;
    }
    .resizable-header {
      position: relative;
    }
    .resize-handle {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 5px;
      cursor: col-resize;
      background: transparent;
      z-index: 2;
    }
    .resize-handle:hover, .resize-handle:active {
      background: var(--primary-color);
    }
    .id-cell {
      /* max-width is handled dynamically in the template */
    }
    .id-text {
      font-size: 0.75rem;
      color: #888;
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .edit-input {
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--border-color);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      width: 100%;
      box-sizing: border-box;
    }
    .empty-state {
      padding: 3rem;
      text-align: center;
      color: var(--text-secondary);
    }
    .trace-badge {
      display: inline-block;
      background: rgba(99, 102, 241, 0.2);
      color: #818cf8;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-right: 4px;
      margin-bottom: 4px;
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
      z-index: 10;
    }
    .trace-badge:hover {
      background: rgba(99, 102, 241, 0.4);
      z-index: 99999;
    }
    .req-row {
      position: relative;
    }
    .req-row:hover {
      z-index: 9999 !important;
    }
    .req-row:target {
      animation: highlight 2s ease-out;
    }
    @keyframes highlight {
      0% { background-color: rgba(99, 102, 241, 0.5); }
      100% { background-color: transparent; }
    }
  `]
})
export class RequirementEditorComponent implements OnInit, OnDestroy {
  projectId: string = '';
  fileType: string = '';
  requirements: any[] = [];
  availableTargets: any[] = [];
  availableTracedBy: any[] = [];
  availableTracesTo: any[] = [];
  displayedColumns: string[] = ['select', 'id', 'name', 'title', 'description', 'tracedBy', 'tracesTo', 'actions'];
  selection = new SelectionModel<any>(true, []);
  isBulkEditing = false;
  fragment: string | null = null;
  
  // Resizable columns state
  columnWidths: { [key: string]: number } = {};
  isResizing = false;
  resizingColumn = '';
  startX = 0;
  startWidth = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService,
    private wsService: WebsocketService,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const newProjectId = params.get('id') || '';
      const newFileType = params.get('fileType') || '';
      
      const projectChanged = this.projectId !== newProjectId;
      const fileTypeChanged = this.fileType !== newFileType;
      
      if (projectChanged || fileTypeChanged) {
        this.projectId = newProjectId;
        this.fileType = newFileType;
        
        this.loadColumnWidths();
        this.loadData();
        
        if (projectChanged) {
          this.wsService.disconnect();
          this.wsService.connect(this.projectId);
        }
      }
    });

    this.wsService.getMessages().subscribe(msg => {
      this.loadData();
    });

    this.route.fragment.subscribe(frag => {
      this.fragment = frag;
      this.scrollToFragment();
    });
  }

  ngOnDestroy() {
    this.wsService.disconnect();
  }

  goBack() {
    this.router.navigate(['/projects', this.projectId]);
  }

  getTracesToPrefixes(): string[] {
    if (this.fileType === 'user') return ['SR-'];
    if (this.fileType === 'system') return ['DIR-', 'SWR-'];
    return [];
  }

  getTracedByPrefixes(): string[] {
    if (this.fileType === 'system') return ['UR-'];
    if (this.fileType === 'design_input' || this.fileType === 'software') return ['SR-'];
    return [];
  }

  loadData() {
    let tracesToTypes: string[] = [];
    let tracedByTypes: string[] = [];

    if (this.fileType === 'user') {
      tracesToTypes = ['system'];
    } else if (this.fileType === 'system') {
      tracedByTypes = ['user'];
      tracesToTypes = ['design_input', 'software'];
    } else if (this.fileType === 'design_input' || this.fileType === 'software') {
      tracedByTypes = ['system'];
    }

    const allTargetTypes = Array.from(new Set([...tracesToTypes, ...tracedByTypes]));

    const reqsObj: any = { main: this.projectService.getFiles(this.projectId, this.fileType) };
    allTargetTypes.forEach(t => { reqsObj[t] = this.projectService.getFiles(this.projectId, t); });

    forkJoin(reqsObj).subscribe((results: any) => {
      const mainReqs = results.main;
      
      let allFetched: any[] = [];
      allTargetTypes.forEach(t => {
        allFetched = allFetched.concat(results[t]);
      });
      this.availableTargets = allFetched;
      
      const tracesToPrefixes = this.getTracesToPrefixes();
      const tracedByPrefixes = this.getTracedByPrefixes();
      
      this.availableTracesTo = allFetched.filter(t => tracesToPrefixes.some(p => (t.name || '').startsWith(p)));
      this.availableTracedBy = allFetched.filter(t => tracedByPrefixes.some(p => (t.name || '').startsWith(p)));

      this.requirements = mainReqs.map((req: any) => {
        const tracesTo = (req.traceLinks || []).filter((linkId: string) => {
          const target = this.availableTargets.find(t => t.id === linkId);
          return target && tracesToPrefixes.some(p => (target.name || '').startsWith(p));
        });

        const tracedBy = this.availableTargets.filter(t => {
          const isExpectedType = tracedByPrefixes.some(p => (t.name || '').startsWith(p));
          if (!isExpectedType) return false;
          
          const parentHasUs = (t.traceLinks || []).includes(req.id);
          const weHaveParent = (req.traceLinks || []).includes(t.id);
          return parentHasUs || weHaveParent;
        }).map(t => t.id);

        return { 
          ...req, 
          isEditing: false,
          traceLinks: [...new Set([...tracesTo, ...tracedBy])],
          tracesTo: tracesTo,
          tracedBy: tracedBy
        };
      });

      this.selection.clear();
      this.isBulkEditing = false;
      this.cdr.detectChanges();
      this.scrollToFragment();
    });
  }

  scrollToFragment() {
    if (this.fragment && this.requirements.length > 0) {
      setTimeout(() => {
        const element = document.getElementById(this.fragment!);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }

  getTargetDetails(id: string): any {
    return this.availableTargets.find(t => t.id === id) || { title: 'Unknown Requirement', description: 'Details not found.' };
  }

  getTargetTooltip(id: string): string {
    const details = this.getTargetDetails(id);
    return `${details.title}\n\n${details.description}`;
  }

  navigateToRequirement(id: string) {
    const target = this.getTargetDetails(id);
    const name = target.name || '';
    let targetFileType = '';
    if (name.startsWith('UR-')) targetFileType = 'user';
    else if (name.startsWith('SR-')) targetFileType = 'system';
    else if (name.startsWith('DIR-')) targetFileType = 'design_input';
    else if (name.startsWith('SWR-')) targetFileType = 'software';
    
    if (targetFileType) {
      this.router.navigate(['/projects', this.projectId, 'editor', targetFileType], { fragment: id });
    }
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.requirements.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }
    this.selection.select(...this.requirements);
  }

  addRequirement() {
    const newReq = { title: 'New Requirement', description: 'Description here...' };
    this.projectService.addRequirement(this.projectId, this.fileType, newReq).subscribe(() => {
      this.loadData();
    });
  }

  saveRequirement(req: any) {
    req.isEditing = false;
    
    // Merge tracesTo and tracedBy back into traceLinks before saving
    const tracesTo = req.tracesTo || [];
    const tracedBy = req.tracedBy || [];
    req.traceLinks = [...new Set([...tracesTo, ...tracedBy])];
    
    const { isEditing, tracesTo: tt, tracedBy: tb, ...dataToSave } = req;
    
    this.projectService.updateRequirement(this.projectId, this.fileType, req.id, dataToSave).subscribe(() => {
      this.loadData();
      this.snackBar.open(`Requirement ${req.id} updated successfully`, 'Close', { duration: 3000 });
    });
  }

  deleteRequirement(req: any, event: Event) {
    event.stopPropagation();
    
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      panelClass: 'glass-dialog-panel',
      data: {
        title: 'Delete Requirement',
        message: 'Are you sure you want to delete this requirement?',
        confirmText: 'Delete'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.projectService.deleteRequirement(this.projectId, this.fileType, req.id).subscribe({
          next: () => {
            this.loadData();
            this.snackBar.open(`Requirement ${req.id} deleted successfully`, 'Close', { duration: 3000 });
          },
          error: (err) => console.error('Error deleting requirement:', err)
        });
      }
    });
  }

  // --- Bulk Operations ---

  bulkEdit() {
    this.isBulkEditing = true;
    this.selection.selected.forEach(req => req.isEditing = true);
  }

  bulkSave() {
    const updates = this.selection.selected.map(req => {
      const tracesTo = req.tracesTo || [];
      const tracedBy = req.tracedBy || [];
      req.traceLinks = [...new Set([...tracesTo, ...tracedBy])];
      
      const { isEditing, tracesTo: tt, tracedBy: tb, ...data } = req;
      return data;
    });
    
    const ids = updates.map(u => u.id).join(', ');

    this.projectService.bulkUpdateRequirements(this.projectId, this.fileType, updates).subscribe(() => {
      this.loadData();
      this.isBulkEditing = false;
      this.snackBar.open(`Bulk update successful for: ${ids}`, 'Close', { duration: 5000 });
    });
  }

  deleteSelected() {
    if (this.selection.selected.length === 0) return;

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      panelClass: 'glass-dialog-panel',
      data: {
        title: 'Delete Multiple',
        message: `Are you sure you want to delete ${this.selection.selected.length} requirements?`,
        confirmText: 'Delete'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const ids = this.selection.selected.map(req => req.id);
        
        let completed = 0;
        ids.forEach(id => {
          this.projectService.deleteRequirement(this.projectId, this.fileType, id).subscribe({
            next: () => {
              completed++;
              if (completed === ids.length) {
                this.selection.clear();
                this.loadData();
                this.snackBar.open(`Bulk delete successful`, 'Close', { duration: 5000 });
              }
            },
            error: (err) => console.error('Error deleting requirement:', err)
          });
        });
      }
    });
  }

  // --- Resizable Columns Logic ---

  loadColumnWidths() {
    const key = `maxr-widths-${this.projectId}-${this.fileType}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        this.columnWidths = JSON.parse(saved);
      } catch (e) {
        this.columnWidths = {};
      }
    } else {
      this.columnWidths = {};
    }
  }

  saveColumnWidths() {
    const key = `maxr-widths-${this.projectId}-${this.fileType}`;
    localStorage.setItem(key, JSON.stringify(this.columnWidths));
  }

  resetColumns() {
    const key = `maxr-widths-${this.projectId}-${this.fileType}`;
    localStorage.removeItem(key);
    this.columnWidths = {};
    this.snackBar.open('Column widths reset to default', 'Close', { duration: 3000 });
  }

  onResizeStart(event: MouseEvent, column: string) {
    event.stopPropagation();
    event.preventDefault();
    this.isResizing = true;
    this.resizingColumn = column;
    this.startX = event.clientX;
    const thElement = (event.target as HTMLElement).closest('th');
    this.startWidth = this.columnWidths[column] || (thElement ? thElement.getBoundingClientRect().width : 100);
    document.body.style.cursor = 'col-resize';
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isResizing) return;
    const delta = event.clientX - this.startX;
    let newWidth = this.startWidth + delta;
    if (newWidth < 50) newWidth = 50; // Minimum width
    this.columnWidths[this.resizingColumn] = newWidth;
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent) {
    if (this.isResizing) {
      this.isResizing = false;
      document.body.style.cursor = '';
      this.saveColumnWidths();
    }
  }
}
