import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';

interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    icon: string;
    sku: string;
}

@Component({
    selector: 'app-cart',
    standalone: true,
    imports: [CommonModule, ZXingScannerModule],
    templateUrl: './cart.component.html',
    styleUrl: './cart.component.scss',
})
export class CartComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private router = inject(Router);

    cartItems: CartItem[] = [];
    showScanner = false;
    scannedCode = '';

    allowedFormats = [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.EAN_13,
        BarcodeFormat.CODE_128,
        BarcodeFormat.DATA_MATRIX
    ];

    get totalAmount(): number {
        return this.cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    }

    ngOnInit() {
        // Load cart from session/local storage if exists
        const savedCart = localStorage.getItem('smartcart_customer_cart');
        if (savedCart) {
            this.cartItems = JSON.parse(savedCart);
        }
    }

    goBack() {
        this.router.navigate(['/dashboard']);
    }

    toggleScanner() {
        this.showScanner = !this.showScanner;
    }

    onCodeResult(resultString: string) {
        this.scannedCode = resultString;
        this.addItemBySku(resultString);
    }

    addItemBySku(sku: string) {
        // Simulate finding a product from the inventory
        const products = JSON.parse(localStorage.getItem('smartcart_products') || '[]');
        const product = products.find((p: any) => p.sku === sku || p.id === sku);

        if (product) {
            const existing = this.cartItems.find(item => item.id === product.id);
            if (existing) {
                existing.quantity++;
            } else {
                this.cartItems.push({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    quantity: 1,
                    icon: product.icon || '📦',
                    sku: product.sku || ''
                });
            }
            this.saveCart();
            this.showScanner = false;
        } else {
            console.warn('Product not found: ' + sku);
            // Optional: show toast or brief error
        }
    }

    removeFromCart(id: string) {
        this.cartItems = this.cartItems.filter(item => item.id !== id);
        this.saveCart();
    }

    updateQuantity(id: string, delta: number) {
        const item = this.cartItems.find(i => i.id === id);
        if (item) {
            item.quantity = Math.max(1, item.quantity + delta);
            this.saveCart();
        }
    }

    private saveCart() {
        localStorage.setItem('smartcart_customer_cart', JSON.stringify(this.cartItems));
        this.cdr.detectChanges();
    }

    checkout() {
        alert('Proceeding to checkout: ₹' + this.totalAmount);
        // Clear cart after checkout
        this.cartItems = [];
        this.saveCart();
    }
}
