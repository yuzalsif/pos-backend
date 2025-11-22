import { Controller, Post, Body, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { AuthGuard } from '../auth/auth.guard'

@Controller('api/v1/products')
@UseGuards(AuthGuard)
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Post()
    create(@Body() createProductDto: CreateProductDto, @Req() req) {
        const { tenantId, userId, name, role } = req.user;

        if (role !== 'owner' && role !== 'manager') {
            throw new UnauthorizedException({ key: 'auth.no_permission' });
        }

        return this.productsService.create(tenantId, userId, name, createProductDto);
    }

    // TODO: Add GET, PATCH, DELETE endpoints
}