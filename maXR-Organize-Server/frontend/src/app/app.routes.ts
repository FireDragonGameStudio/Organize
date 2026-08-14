import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ProjectDetailsComponent } from './components/project-details/project-details.component';
import { RequirementEditorComponent } from './components/requirement-editor/requirement-editor.component';
import { TraceabilityMatrixComponent } from './components/traceability-matrix/traceability-matrix.component';
import { Graph3dComponent } from './components/graph-3d/graph-3d.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'projects/:id', component: ProjectDetailsComponent },
  { path: 'projects/:id/matrix', component: TraceabilityMatrixComponent },
  { path: 'projects/:id/3d-graph', component: Graph3dComponent },
  { path: 'projects/:id/editor/:fileType', component: RequirementEditorComponent },
  { path: '**', redirectTo: '' }
];
