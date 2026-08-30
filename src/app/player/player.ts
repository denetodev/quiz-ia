import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService, GameState } from '../supabase.service';

const QUESTIONS = [
  {
    q: 'Complete: "A IA não faz o meu trabalho, ela..."',
    a: ['pensa por mim', 'acelera o que eu já faria.', 'substitui o Excel', 'faz tudo sozinha'],
    c: 1,
  },
  {
    q: 'Quem escreveu o livro "Eu, Robô"?',
    a: ['Alan Turing', 'Arthur C. Clarke', 'Isaac Asimov', 'Will Smith'],
    c: 2,
  },
  {
    q: 'Em que ano viralizou o vídeo do Will Smith comendo macarrão gerado por IA?',
    a: ['2015', '2020', '2023', '2025'],
    c: 2,
  },
  {
    q: 'Usar RAG é como dar o quê para a IA?',
    a: [
      'Mais memória RAM',
      'Um caderno de consulta com seus dados',
      'Um cérebro novo',
      'Acesso à internet',
    ],
    c: 1,
  },
  {
    q: 'Qual livro defende "aplicar pra aprender" — e está saindo de presente hoje?',
    a: ['Mindset', 'O Poder do Hábito', 'Hábitos Atômicos', 'Ultraaprendizado'],
    c: 3,
  },
];

type ViewState = 'join' | 'lobby' | 'question' | 'reveal' | 'final';

@Component({
  selector: 'app-player',
  imports: [FormsModule],
  templateUrl: './player.html',
  styleUrl: './player.scss',
})
export class Player implements OnInit, OnDestroy {
  view = signal<ViewState>('join');
  name = signal('');
  myName = signal(''); // <-- agora público, o template acessa
  joinError = signal('');
  joining = signal(false);

  currentQuestion = signal<number>(-1);
  revealedQuestionIndex = signal(0);
  questionShownAt = 0;
  myAnswer = signal<number | null>(null);
  wasCorrect = signal(false);
  pointsEarned = signal(0);
  finalRank = signal(0);
  finalPoints = signal(0);

  questions = QUESTIONS;
  private gameChannel: any;

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {}

  ngOnDestroy() {
    this.gameChannel?.unsubscribe();
  }

  async join() {
    const n = this.name().trim();
    if (!n) {
      this.joinError.set('Digite um nome pra entrar.');
      return;
    }
    this.joining.set(true);
    this.myName.set(n);

    const exists = await this.supabase.playerExists(n);
    if (!exists) {
      const { error } = await this.supabase.joinAsPlayer(n);
      if (error) {
        this.joinError.set('Não consegui te cadastrar. Tenta outro nome.');
        this.joining.set(false);
        return;
      }
    }

    this.gameChannel = this.supabase.onGameStateChange((state) => this.handleState(state));
    const state = await this.supabase.getGameState();
    if (state) this.handleState(state);
    else this.view.set('lobby');

    this.joining.set(false);
  }

  private async handleState(state: GameState) {
    if (state.phase === 'lobby') {
      this.view.set('lobby');
    } else if (state.phase === 'q') {
      if (this.currentQuestion() !== state.question_index) {
        this.currentQuestion.set(state.question_index);
        this.questionShownAt = Date.now();
        this.myAnswer.set(null);
        const prev = await this.supabase.hasAnswered(this.myName(), state.question_index);
        if (prev) this.myAnswer.set(prev.choice);
      }
      this.view.set('question');
    } else if (state.phase === 'reveal') {
      await this.computeReveal(state.question_index);
      this.view.set('reveal');
    } else if (state.phase === 'final') {
      await this.computeFinal();
      this.view.set('final');
    }
  }

  async answer(choice: number) {
    if (this.myAnswer() !== null) return;
    this.myAnswer.set(choice);
    const timeMs = Date.now() - this.questionShownAt;
    const { error } = await this.supabase.submitAnswer({
      player_name: this.myName(),
      question_index: this.currentQuestion(),
      choice,
      answer_time_ms: timeMs,
    });
    if (error) this.myAnswer.set(null);
  }

  private score(t: number): number {
    const SPEED_WINDOW = 20000;
    return 1000 + Math.round(500 * Math.max(0, 1 - t / SPEED_WINDOW));
  }

  private async computeReveal(qIndex: number) {
    this.revealedQuestionIndex.set(qIndex);
    const correct = this.questions[qIndex].c;
    const mine = this.myAnswer();
    if (mine === correct) {
      const rows = await this.supabase.getAnswersForQuestion(qIndex);
      const mineRow = rows.find((r) => r.player_name === this.myName());
      const pts = mineRow ? this.score(mineRow.answer_time_ms) : 0;
      this.wasCorrect.set(true);
      this.pointsEarned.set(pts);
    } else {
      this.wasCorrect.set(false);
      this.pointsEarned.set(0);
    }
  }

  private async computeFinal() {
    const allAnswers = await this.supabase.getAllAnswers();
    const totals: Record<string, number> = {};
    for (const row of allAnswers) {
      const correct = this.questions[row.question_index]?.c;
      if (correct === row.choice) {
        totals[row.player_name] = (totals[row.player_name] || 0) + this.score(row.answer_time_ms);
      }
    }
    const ranking = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const idx = ranking.findIndex(([n]) => n === this.myName());
    this.finalRank.set(idx + 1);
    this.finalPoints.set(idx >= 0 ? ranking[idx][1] : 0);
  }

  correctAnswerText(): string {
    const q = this.questions[this.revealedQuestionIndex()];
    return q ? q.a[q.c] : '';
  }
}
