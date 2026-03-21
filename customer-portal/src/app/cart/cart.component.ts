import { Component, inject, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import Quagga from '@ericblade/quagga2';

@Component({
    selector: 'app-cart',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './cart.component.html',
    styleUrl: './cart.component.scss',
})
export class CartComponent implements OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private router = inject(Router);

    showScanner = false;
    scannedCode = '';
    errorMessage = '';

    ngOnDestroy() {
        this.stopScanner();
    }

    goBack() {
        this.stopScanner();
        this.router.navigate(['/dashboard']);
    }

    toggleScanner() {
        this.showScanner = !this.showScanner;
        if (this.showScanner) {
            this.scannedCode = '';
            this.errorMessage = '';
            // Delay initialization slightly to ensure the DOM element is present
            setTimeout(() => this.initScanner(), 100);
        } else {
            this.stopScanner();
        }
    }

    private initScanner() {
        Quagga.init({
            inputStream: {
                type: "LiveStream",
                target: document.querySelector('#interactive') as HTMLElement,
                constraints: {
                    facingMode: 'environment',
                    width: { min: 640 },
                    height: { min: 480 },
                    aspectRatio: { min: 1, max: 2 }
                },
                area: { // defines rectangle of the detection
                    top: '35%',    // 30% scanning strip in the middle
                    right: '7.5%', // 85% width
                    left: '7.5%',
                    bottom: '35%'
                },
            },
            decoder: {
                readers: ['ean_reader', 'code_128_reader', 'code_39_reader']
            },
            locate: true,
        }, (err) => {
            if (err) {
                console.error("Quagga initialization failed: ", err);
                this.errorMessage = `Camera error: ${err.name || err}`;
                this.cdr.detectChanges();
                return;
            }
            Quagga.start();
        });

        Quagga.onDetected((res) => {
            if (res?.codeResult?.code) {
                this.onCodeResult(res.codeResult.code);
            }
        });
    }

    private stopScanner() {
        if (this.showScanner || (Quagga as any).canvas) {
            Quagga.stop();
        }
    }

    onCodeResult(resultString: string) {
        this.scannedCode = resultString;
        this.showScanner = false;
        this.stopScanner();
        this.cdr.detectChanges();
    }
}
