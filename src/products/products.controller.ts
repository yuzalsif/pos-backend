import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { AuthGuard, type RequestWithUser } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Permission } from '../auth/permissions.enum';

@Controller('api/v1/products')
@UseGuards(AuthGuard, PermissionsGuard)
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Post()
    @RequirePermissions(Permission.PRODUCTS_CREATE)
    create(@Body() createProductDto: CreateProductDto, @Req() req: RequestWithUser) {
        const { tenantId, userId, name } = req.user;

        return this.productsService.create(tenantId, userId, name, createProductDto);
    }

    // TODO: Add GET, PATCH, DELETE endpoints
}