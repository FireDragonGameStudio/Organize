import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<any>();

  constructor() {}

  connect(projectId: string): void {
    if (this.socket) {
      this.socket.close();
    }
    this.socket = new WebSocket(`ws://${window.location.hostname}:3000/sync/projects/${projectId}`);

    this.socket.onopen = () => {
      console.log(`WebSocket connected to project ${projectId}`);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.messageSubject.next(data);
      } catch (e) {
        this.messageSubject.next(event.data);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket Error', error);
    };

    this.socket.onclose = () => {
      console.log('WebSocket connection closed');
    };
  }

  getMessages(): Observable<any> {
    return this.messageSubject.asObservable();
  }

  sendMessage(message: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
    } else {
      console.error('WebSocket is not open');
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
