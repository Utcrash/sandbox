import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SourceStructureService } from './services/source-structure.service';
import { TargetStructureService } from './services/target-structure.service';
import { AppComponent } from './app.component';

@NgModule({
    declarations: [
        AppComponent,
    ],
    imports: [
        BrowserModule,
        HttpClientModule,
        FormsModule,

    ],
    providers: [SourceStructureService, TargetStructureService],
    bootstrap: [AppComponent]
})
export class AppModule { }
