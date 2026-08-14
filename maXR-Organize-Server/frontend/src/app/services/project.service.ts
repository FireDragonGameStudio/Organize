import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private apiUrl = `http://${window.location.hostname}:3000/api/projects`;

  constructor(private http: HttpClient) {}

  getProjects(): Observable<Project[]> {
    return this.http.get<Project[]>(this.apiUrl);
  }

  createProject(name: string): Observable<Project> {
    return this.http.post<Project>(this.apiUrl, { name });
  }

  deleteProject(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  getFiles(projectId: string, fileType: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${projectId}/files/${fileType}`);
  }

  uploadFile(projectId: string, fileType: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/${projectId}/files/${fileType}`, formData);
  }

  addRequirement(projectId: string, fileType: string, requirement: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${projectId}/files/${fileType}/requirements`, requirement);
  }

  updateRequirement(projectId: string, fileType: string, reqId: string, requirement: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${projectId}/files/${fileType}/requirements/${reqId}`, requirement);
  }

  deleteRequirement(projectId: string, fileType: string, reqId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${projectId}/files/${fileType}/requirements/${reqId}`);
  }

  bulkUpdateRequirements(projectId: string, fileType: string, updates: any[]): Observable<any[]> {
    return this.http.put<any[]>(`${this.apiUrl}/${projectId}/files/${fileType}/requirements/bulk`, updates);
  }

  bulkDeleteRequirements(projectId: string, fileType: string, reqIds: string[]): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${projectId}/files/${fileType}/requirements/bulk`, { body: reqIds });
  }

  changeRequirementType(projectId: string, oldFileType: string, reqId: string, newFileType: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${projectId}/files/${oldFileType}/requirements/${reqId}/change-type`, { newFileType });
  }
}
