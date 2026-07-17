import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppState } from '../../store/app.state';
import * as AppActions from '../../store/app.actions';
import { selectIsAdminModalOpen, selectUserRole } from '../../store/app.selectors';

@Component({
  selector: 'app-admin-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-modal.html',
  styleUrl: './admin-modal.scss'
})
export class AdminModalComponent {
  isOpen$: Observable<boolean>;
  isAdmin$: Observable<boolean>;
  activeTab = 'responsables';

  constructor(private store: Store<{ app: AppState }>) {
    this.isOpen$ = this.store.select(selectIsAdminModalOpen);
    this.isAdmin$ = this.store.select(selectUserRole).pipe(
      map(role => role === 'admin' || role === 'editor')
    );
  }

  openModal() {
    this.store.dispatch(AppActions.toggleAdminModal({ isOpen: true }));
  }

  closeModal() {
    this.store.dispatch(AppActions.toggleAdminModal({ isOpen: false }));
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }
}
