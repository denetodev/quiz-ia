import { Routes } from '@angular/router';
import { Player } from './player/player';
import { Host } from './host/host';

export const routes: Routes = [
  { path: '', component: Player },
  { path: 'host', component: Host },
];
